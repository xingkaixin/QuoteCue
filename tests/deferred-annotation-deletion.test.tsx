import { act, useCallback, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DraftAnnotation } from "@/features/annotations/annotation";
import { useDeferredAnnotationDeletion } from "@/features/annotations/use-deferred-annotation-deletion";

const annotations: DraftAnnotation[] = [
  {
    id: "annotation-a",
    anchor: {
      messageId: "message-a",
      quote: "first",
      prefix: "",
      suffix: "",
      start: 0,
      end: 5,
    },
    comment: "",
  },
  {
    id: "annotation-b",
    anchor: {
      messageId: "message-b",
      quote: "second",
      prefix: "",
      suffix: "",
      start: 0,
      end: 6,
    },
    comment: "",
  },
];

let latestDeletion: ReturnType<typeof useDeferredAnnotationDeletion>;
const commitDeletion = vi.fn();

afterEach(() => {
  commitDeletion.mockReset();
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe("deferred annotation deletion", () => {
  it("preserves order on undo without committing a deletion", async () => {
    vi.useFakeTimers();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => root.render(<DeletionHarness scopeKey="A" />));
    await act(async () => latestDeletion.requestDeletion("annotation-a"));
    expect(latestDeletion.visibleAnnotations.map(({ id }) => id)).toEqual(["annotation-b"]);
    expect(latestDeletion.requestDeletion("annotation-b")).toBe(false);

    await act(async () => latestDeletion.undoDeletion());
    expect(latestDeletion.visibleAnnotations.map(({ id }) => id)).toEqual([
      "annotation-a",
      "annotation-b",
    ]);
    await act(async () => vi.advanceTimersByTime(5_000));
    expect(commitDeletion).not.toHaveBeenCalled();

    await act(async () => root.unmount());
  });

  it("commits exactly once when the undo window expires", async () => {
    vi.useFakeTimers();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => root.render(<DeletionHarness scopeKey="A" />));
    await act(async () => latestDeletion.requestDeletion("annotation-a"));
    await act(async () => vi.advanceTimersByTime(5_000));

    expect(commitDeletion).toHaveBeenCalledOnce();
    expect(commitDeletion).toHaveBeenCalledWith("annotation-a");
    expect(latestDeletion.visibleAnnotations.map(({ id }) => id)).toEqual(["annotation-b"]);

    await act(async () => root.unmount());
  });
});

function DeletionHarness({ scopeKey }: { scopeKey: string }) {
  const [currentAnnotations, setCurrentAnnotations] = useState(annotations);
  const commit = useCallback((annotationId: string) => {
    commitDeletion(annotationId);
    setCurrentAnnotations((current) =>
      current.filter((annotation) => annotation.id !== annotationId),
    );
  }, []);
  latestDeletion = useDeferredAnnotationDeletion(currentAnnotations, scopeKey, commit);
  return null;
}
