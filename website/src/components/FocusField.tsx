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

#define PI 3.14159265359

mat2 rotate2d(float angle) {
  float sine = sin(angle);
  float cosine = cos(angle);
  return mat2(cosine, -sine, sine, cosine);
}

float sphereDistance(vec3 point, float radius) {
  return length(point) - radius;
}

float torusDistance(vec3 point, vec2 radii) {
  vec2 ring = vec2(length(point.xy) - radii.x, point.z);
  return length(ring) - radii.y;
}

vec2 closerSurface(vec2 current, float distance, float material) {
  return distance < current.x ? vec2(distance, material) : current;
}

vec2 sceneDistance(vec3 point) {
  point.xz *= rotate2d(-0.48 + u_pointer.x * 0.16);
  point.yz *= rotate2d(0.28 - u_pointer.y * 0.12);

  vec2 surface = vec2(torusDistance(point, vec2(0.86, 0.105)), 1.0);

  vec3 orbitA = point;
  orbitA.yz *= rotate2d(0.92);
  surface = closerSurface(surface, torusDistance(orbitA, vec2(1.11, 0.018)), 2.0);

  vec3 orbitB = point;
  orbitB.xz *= rotate2d(1.16);
  surface = closerSurface(surface, torusDistance(orbitB, vec2(1.02, 0.014)), 2.0);

  for (int index = 0; index < 11; index++) {
    float angle = float(index) / 11.0 * PI * 2.0 + u_time * 0.1;
    vec3 node = vec3(cos(angle) * 0.86, sin(angle) * 0.86, 0.0);
    float nodeSize = index == 3 ? 0.052 : 0.027;
    float material = index == 3 ? 3.0 : 2.0;
    surface = closerSurface(surface, sphereDistance(point - node, nodeSize), material);
  }

  return surface;
}

vec3 surfaceNormal(vec3 point) {
  vec2 step = vec2(0.0015, 0.0);
  float center = sceneDistance(point).x;
  return normalize(vec3(
    sceneDistance(point + step.xyy).x - center,
    sceneDistance(point + step.yxy).x - center,
    sceneDistance(point + step.yyx).x - center
  ));
}

float softGrid(vec2 point) {
  vec2 grid = abs(fract(point * 5.5) - 0.5);
  return smoothstep(0.46, 0.495, max(grid.x, grid.y));
}

void main() {
  vec2 coordinates = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / u_resolution.y;
  vec3 rayOrigin = vec3(0.0, 0.0, 3.25);
  vec3 rayDirection = normalize(vec3(coordinates, -1.85));

  vec3 darkBackground = vec3(0.027, 0.082, 0.11);
  vec3 lightBackground = vec3(0.91, 0.945, 0.937);
  vec3 background = mix(lightBackground, darkBackground, u_dark);
  float halo = exp(-1.6 * length(coordinates - vec2(0.2, 0.05)));
  vec3 cyan = mix(vec3(0.02, 0.43, 0.52), vec3(0.08, 0.72, 0.83), u_dark);
  vec3 pink = mix(vec3(0.68, 0.1, 0.31), vec3(0.85, 0.28, 0.51), u_dark);
  background += cyan * halo * mix(0.1, 0.2, u_dark);
  background += softGrid(coordinates + vec2(u_time * 0.006, 0.0)) * mix(0.018, 0.035, u_dark);

  float distanceTraveled = 0.0;
  float material = 0.0;
  bool hit = false;

  for (int stepIndex = 0; stepIndex < 80; stepIndex++) {
    vec3 point = rayOrigin + rayDirection * distanceTraveled;
    vec2 result = sceneDistance(point);
    if (result.x < 0.0015) {
      hit = true;
      material = result.y;
      break;
    }
    if (distanceTraveled > 6.0) break;
    distanceTraveled += result.x * 0.78;
  }

  vec3 color = background;

  if (hit) {
    vec3 point = rayOrigin + rayDirection * distanceTraveled;
    vec3 normal = surfaceNormal(point);
    vec3 lightDirection = normalize(vec3(-0.7, 0.9, 1.15));
    float diffuse = max(dot(normal, lightDirection), 0.0);
    float rim = pow(1.0 - max(dot(normal, -rayDirection), 0.0), 2.6);
    float gleam = pow(max(dot(reflect(-lightDirection, normal), -rayDirection), 0.0), 38.0);

    vec3 porcelain = mix(vec3(0.16, 0.31, 0.34), vec3(0.84, 0.92, 0.9), u_dark);
    vec3 materialColor = material < 1.5 ? porcelain : (material < 2.5 ? cyan : pink);
    color = materialColor * (0.38 + diffuse * 0.74) + rim * cyan * 0.58 + gleam * vec3(1.0);
    color = mix(color, background, smoothstep(3.2, 5.8, distanceTraveled) * 0.16);
  }

  float vignette = smoothstep(1.65, 0.25, length(coordinates * vec2(0.76, 1.0)));
  color *= mix(0.74, 1.0, vignette);
  color += pink * 0.035 * exp(-14.0 * length(coordinates - vec2(0.7, -0.25)));
  color = pow(color, vec3(0.92));

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

export function FocusField() {
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
      const pixelRatio = Math.min(window.devicePixelRatio, 1.5);
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

  return <canvas aria-hidden="true" className="focus-field" ref={canvasRef} />;
}
