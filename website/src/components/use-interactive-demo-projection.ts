import { useCallback, useEffect, useLayoutEffect, useRef, useState, type TouchEvent } from "react";

import type { DemoAnnotation } from "./interactive-demo-state";
import {
  captureDemoTextAnchor,
  restoreDemoTextAnchor,
  type DemoTextAnchor,
} from "./interactive-demo-text-anchor";

const highlightName = "quotecue-demo";
const useClientLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

interface SelectionCandidate {
  anchor: DemoTextAnchor;
  range: Range;
}

type ResolvedDemoAnnotation = {
  annotation: DemoAnnotation;
  range: Range;
};

interface Point {
  left: number;
  top: number;
}

interface BadgePoint extends Point {
  id: number;
}

interface Geometry {
  action: Point | null;
  editor: Point | null;
  badges: BadgePoint[];
}

interface HighlightRegistry {
  delete: (name: string) => boolean;
  set: (name: string, highlight: unknown) => void;
}

type HighlightConstructor = new (...ranges: Range[]) => unknown;

export function useInteractiveDemoProjection(
  annotations: DemoAnnotation[],
  editingId: number | null,
) {
  const stageRef = useRef<HTMLDivElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const [candidate, setCandidate] = useState<SelectionCandidate | null>(null);
  const [layoutVersion, setLayoutVersion] = useState(0);
  const [geometry, setGeometry] = useState<Geometry>({ action: null, badges: [], editor: null });

  useEffect(() => {
    const updateLayout = () => setLayoutVersion((version) => version + 1);
    window.addEventListener("resize", updateLayout);
    window.addEventListener("scroll", updateLayout, { passive: true });
    return () => {
      window.removeEventListener("resize", updateLayout);
      window.removeEventListener("scroll", updateLayout);
    };
  }, []);

  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `::highlight(${highlightName}) { background: var(--mark); }`;
    document.head.append(style);
    return () => {
      getHighlightApi().registry?.delete(highlightName);
      style.remove();
    };
  }, []);

  useEffect(() => {
    const { Highlight, registry } = getHighlightApi();
    if (!Highlight || !registry) return;

    const transcript = transcriptRef.current;
    const ranges = transcript
      ? resolveAnnotations(transcript, annotations).map(({ range }) => range)
      : [];
    if (candidate) ranges.push(candidate.range);
    if (ranges.length === 0) {
      registry.delete(highlightName);
      return;
    }

    registry.set(highlightName, new Highlight(...ranges));
  }, [annotations, candidate]);

  useClientLayoutEffect(() => {
    if (!stageRef.current || !transcriptRef.current) return;
    setGeometry(
      measureGeometry(stageRef.current, transcriptRef.current, candidate, annotations, editingId),
    );
  }, [annotations, candidate, editingId, layoutVersion]);

  useEffect(() => {
    if (editingId !== null) editorRef.current?.focus();
  }, [editingId]);

  const captureSelection = useCallback(() => {
    const selection = window.getSelection();
    const transcript = transcriptRef.current;
    if (!selection || selection.isCollapsed || !transcript) {
      setCandidate(null);
      return;
    }

    const range = selection.getRangeAt(0);
    const anchor = captureDemoTextAnchor(transcript, range);
    if (!anchor || anchor.quote.length < 2) {
      setCandidate(null);
      return;
    }

    const anchoredRange = restoreDemoTextAnchor(transcript, anchor);
    setCandidate(anchoredRange ? { anchor, range: anchoredRange } : null);
  }, []);

  const captureTouchSelection = useCallback(
    (event: TouchEvent<HTMLDivElement>) => {
      event.persist();
      window.setTimeout(captureSelection, 0);
    },
    [captureSelection],
  );

  const clearCandidate = useCallback(() => {
    setCandidate(null);
    window.getSelection()?.removeAllRanges();
  }, []);

  return {
    candidate,
    captureSelection,
    captureTouchSelection,
    clearCandidate,
    editorRef,
    geometry,
    stageRef,
    transcriptRef,
  };
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function getLastRect(range: Range) {
  const rectangles = Array.from(range.getClientRects());
  return rectangles.at(-1) ?? range.getBoundingClientRect();
}

function measureGeometry(
  stage: HTMLDivElement,
  transcript: HTMLDivElement,
  candidate: SelectionCandidate | null,
  annotations: DemoAnnotation[],
  editingId: number | null,
): Geometry {
  const stageRect = stage.getBoundingClientRect();
  const toStagePoint = (rect: DOMRect) => ({
    left: rect.left - stageRect.left,
    top: rect.top - stageRect.top,
  });

  let action: Point | null = null;
  if (candidate) {
    const rect = getLastRect(candidate.range);
    const point = toStagePoint(rect);
    action = {
      left: clamp(point.left + rect.width + 8, 12, Math.max(12, stage.clientWidth - 112)),
      top: clamp(point.top + rect.height + 8, 8, Math.max(8, stage.clientHeight - 44)),
    };
  }

  const resolvedAnnotations = resolveAnnotations(transcript, annotations);
  const badges = resolvedAnnotations.flatMap(({ annotation, range }) => {
    const rect = getLastRect(range);
    if (rect.width === 0) return [];
    const point = toStagePoint(rect);
    return [
      {
        id: annotation.id,
        left: clamp(point.left + rect.width + 3, 8, Math.max(8, stage.clientWidth - 28)),
        top: clamp(point.top + rect.height / 2 - 10, 8, Math.max(8, stage.clientHeight - 28)),
      },
    ];
  });

  let editor: Point | null = null;
  const editing = resolvedAnnotations.find(({ annotation }) => annotation.id === editingId);
  if (editing) {
    const rectangles = Array.from(editing.range.getClientRects());
    const firstRect = rectangles[0] ?? editing.range.getBoundingClientRect();
    const lastRect = rectangles.at(-1) ?? firstRect;
    const first = toStagePoint(firstRect);
    const last = toStagePoint(lastRect);
    const cardHeight = 182;
    const cardWidth = Math.min(340, stage.clientWidth - 32);
    const maximumTop = Math.max(16, stage.clientHeight - cardHeight - 16);
    let top = last.top + lastRect.height + 10;
    if (top > maximumTop) top = first.top - cardHeight - 10;
    editor = {
      left: clamp(last.left, 16, Math.max(16, stage.clientWidth - cardWidth - 16)),
      top: clamp(top, 16, maximumTop),
    };
  }

  return { action, badges, editor };
}

function resolveAnnotations(
  transcript: HTMLElement,
  annotations: readonly DemoAnnotation[],
): ResolvedDemoAnnotation[] {
  return annotations.flatMap((annotation) => {
    const range = restoreDemoTextAnchor(transcript, annotation.anchor);
    return range ? [{ annotation, range }] : [];
  });
}

function getHighlightApi() {
  const css = window.CSS as typeof CSS & { highlights?: HighlightRegistry };
  const Highlight = (window as Window & { Highlight?: HighlightConstructor }).Highlight;
  return { Highlight, registry: css.highlights };
}
