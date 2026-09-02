import { useEffect, useRef } from "react";

const vertexShaderSource = `
attribute vec2 a_position;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const fragmentShaderSource = `
precision highp float;

uniform vec2 u_resolution;
uniform vec2 u_pointer;
uniform float u_time;
uniform float u_dark;

float segmentDistance(vec2 point, vec2 start, vec2 end) {
  vec2 offset = point - start;
  vec2 segment = end - start;
  float amount = clamp(dot(offset, segment) / dot(segment, segment), 0.0, 1.0);
  return length(offset - segment * amount);
}

vec2 curvePoint(vec2 start, vec2 control, vec2 end, float amount) {
  float inverse = 1.0 - amount;
  return inverse * inverse * start + 2.0 * inverse * amount * control + amount * amount * end;
}

float curveDistance(vec2 point, vec2 start, vec2 control, vec2 end) {
  float distanceToCurve = 10.0;
  vec2 previous = start;

  for (int index = 1; index <= 28; index++) {
    float amount = float(index) / 28.0;
    vec2 current = curvePoint(start, control, end, amount);
    distanceToCurve = min(distanceToCurve, segmentDistance(point, previous, current));
    previous = current;
  }

  return distanceToCurve;
}

float softGrid(vec2 point) {
  vec2 grid = abs(fract(point * 5.0) - 0.5);
  return smoothstep(0.47, 0.498, max(grid.x, grid.y));
}

void main() {
  vec2 coordinates = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / u_resolution.y;
  vec2 parallax = u_pointer * 0.018;
  vec2 sourceOne = vec2(-0.54, 0.29) + parallax;
  vec2 sourceTwo = vec2(-0.47, -0.08) + parallax;
  vec2 sink = vec2(0.08, -0.72);
  vec2 controlOne = vec2(0.52, 0.28);
  vec2 controlTwo = vec2(0.62, -0.16);

  float firstCurve = curveDistance(coordinates, sourceOne, controlOne, sink);
  float secondCurve = curveDistance(coordinates, sourceTwo, controlTwo, sink);
  float firstTrail = smoothstep(0.028, 0.003, firstCurve);
  float secondTrail = smoothstep(0.028, 0.003, secondCurve);

  float firstProgress = fract(u_time * 0.075 + 0.12);
  float secondProgress = fract(u_time * 0.075 + 0.58);
  vec2 firstPulsePoint = curvePoint(sourceOne, controlOne, sink, firstProgress);
  vec2 secondPulsePoint = curvePoint(sourceTwo, controlTwo, sink, secondProgress);
  float firstPulse = exp(-900.0 * dot(coordinates - firstPulsePoint, coordinates - firstPulsePoint));
  float secondPulse = exp(-900.0 * dot(coordinates - secondPulsePoint, coordinates - secondPulsePoint));

  vec3 darkBackground = vec3(0.027, 0.082, 0.11);
  vec3 lightBackground = vec3(0.91, 0.945, 0.937);
  vec3 cyan = mix(vec3(0.02, 0.43, 0.52), vec3(0.08, 0.72, 0.83), u_dark);
  vec3 pink = mix(vec3(0.68, 0.1, 0.31), vec3(0.85, 0.28, 0.51), u_dark);
  vec3 color = mix(lightBackground, darkBackground, u_dark);

  color += softGrid(coordinates) * mix(0.014, 0.026, u_dark);
  color += cyan * (firstTrail + secondTrail) * mix(0.07, 0.14, u_dark);
  color += cyan * firstPulse * 0.72;
  color += pink * secondPulse * 0.66;

  float sinkGlow = exp(-18.0 * length(coordinates - sink));
  color += cyan * sinkGlow * mix(0.05, 0.11, u_dark);

  gl_FragColor = vec4(color, 1.0);
}
`;

function createShader(
  context: WebGLRenderingContext,
  type: number,
  source: string,
): WebGLShader | null {
  const shader = context.createShader(type);
  if (!shader) return null;

  context.shaderSource(shader, source);
  context.compileShader(shader);

  if (!context.getShaderParameter(shader, context.COMPILE_STATUS)) {
    context.deleteShader(shader);
    return null;
  }

  return shader;
}

function createProgram(context: WebGLRenderingContext): WebGLProgram | null {
  const vertexShader = createShader(context, context.VERTEX_SHADER, vertexShaderSource);
  const fragmentShader = createShader(context, context.FRAGMENT_SHADER, fragmentShaderSource);
  if (!vertexShader || !fragmentShader) return null;

  const program = context.createProgram();
  if (!program) return null;

  context.attachShader(program, vertexShader);
  context.attachShader(program, fragmentShader);
  context.linkProgram(program);
  context.deleteShader(vertexShader);
  context.deleteShader(fragmentShader);

  if (!context.getProgramParameter(program, context.LINK_STATUS)) {
    context.deleteProgram(program);
    return null;
  }

  return program;
}

export function CueFlowField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvasElement = canvasRef.current;
    if (!canvasElement) return;

    const gl = canvasElement.getContext("webgl", { alpha: false, antialias: false });
    if (!gl) return;

    const activeCanvas: HTMLCanvasElement = canvasElement;
    const context: WebGLRenderingContext = gl;
    const program = createProgram(context);
    if (!program) return;

    const buffer = context.createBuffer();
    const positionLocation = context.getAttribLocation(program, "a_position");
    const resolutionLocation = context.getUniformLocation(program, "u_resolution");
    const pointerLocation = context.getUniformLocation(program, "u_pointer");
    const timeLocation = context.getUniformLocation(program, "u_time");
    const darkLocation = context.getUniformLocation(program, "u_dark");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const targetPointer = { x: 0, y: 0 };
    const pointer = { x: 0, y: 0 };
    let animationFrame = 0;
    let visible = true;

    context.bindBuffer(context.ARRAY_BUFFER, buffer);
    context.bufferData(
      context.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      context.STATIC_DRAW,
    );
    context.useProgram(program);
    context.enableVertexAttribArray(positionLocation);
    context.vertexAttribPointer(positionLocation, 2, context.FLOAT, false, 0, 0);

    function draw(now: number) {
      animationFrame = 0;
      if (!visible) return;

      const width = activeCanvas.clientWidth;
      const height = activeCanvas.clientHeight;
      const pixelRatio = Math.min(window.devicePixelRatio, 1.4);
      const nextWidth = Math.max(1, Math.round(width * pixelRatio));
      const nextHeight = Math.max(1, Math.round(height * pixelRatio));

      if (activeCanvas.width !== nextWidth || activeCanvas.height !== nextHeight) {
        activeCanvas.width = nextWidth;
        activeCanvas.height = nextHeight;
      }

      pointer.x += (targetPointer.x - pointer.x) * 0.06;
      pointer.y += (targetPointer.y - pointer.y) * 0.06;
      context.viewport(0, 0, activeCanvas.width, activeCanvas.height);
      context.uniform2f(resolutionLocation, activeCanvas.width, activeCanvas.height);
      context.uniform2f(pointerLocation, pointer.x, pointer.y);
      context.uniform1f(timeLocation, reducedMotion.matches ? 4.2 : now * 0.001);
      context.uniform1f(darkLocation, document.documentElement.dataset.theme === "light" ? 0 : 1);
      context.drawArrays(context.TRIANGLES, 0, 6);

      if (!reducedMotion.matches) animationFrame = requestAnimationFrame(draw);
    }

    function requestDraw() {
      if (!animationFrame && visible) animationFrame = requestAnimationFrame(draw);
    }

    function handlePointerMove(event: PointerEvent) {
      if (reducedMotion.matches) return;
      const bounds = activeCanvas.getBoundingClientRect();
      targetPointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
      targetPointer.y = 1 - ((event.clientY - bounds.top) / bounds.height) * 2;
    }

    function handlePointerLeave() {
      targetPointer.x = 0;
      targetPointer.y = 0;
    }

    const resizeObserver = new ResizeObserver(requestDraw);
    const visibilityObserver = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) requestDraw();
      else if (animationFrame) cancelAnimationFrame(animationFrame);
    });
    const themeObserver = new MutationObserver(requestDraw);

    resizeObserver.observe(activeCanvas);
    visibilityObserver.observe(activeCanvas);
    themeObserver.observe(document.documentElement, {
      attributeFilter: ["data-theme"],
      attributes: true,
    });
    reducedMotion.addEventListener("change", requestDraw);
    activeCanvas.addEventListener("pointermove", handlePointerMove);
    activeCanvas.addEventListener("pointerleave", handlePointerLeave);
    requestDraw();

    return () => {
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
      themeObserver.disconnect();
      reducedMotion.removeEventListener("change", requestDraw);
      activeCanvas.removeEventListener("pointermove", handlePointerMove);
      activeCanvas.removeEventListener("pointerleave", handlePointerLeave);
      context.deleteBuffer(buffer);
      context.deleteProgram(program);
    };
  }, []);

  return <canvas aria-hidden="true" className="cue-flow-field" ref={canvasRef} />;
}
