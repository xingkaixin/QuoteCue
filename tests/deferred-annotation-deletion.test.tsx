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
const commitDeletions = vi.fn();

afterEach(() => {
  commitDeletions.mockReset();
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe("deferred annotation deletion", () => {
  it("groups consecutive deletions and restores their original order on undo", async () => {
    vi.useFakeTimers();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => root.render(<DeletionHarness scopeKey="A" />));
    await act(async () => latestDeletion.requestDeletion("annotation-a"));
    expect(latestDeletion.visibleAnnotations.map(({ id }) => id)).toEqual(["annotation-b"]);
    await act(async () => vi.advanceTimersByTime(4_000));
    await act(async () => latestDeletion.requestDeletion("annotation-b"));
    expect(latestDeletion.pendingDeletionCount).toBe(2);
    expect(latestDeletion.visibleAnnotations).toEqual([]);
    await act(async () => vi.advanceTimersByTime(1_000));
    expect(commitDeletions).not.toHaveBeenCalled();

    await act(async () => latestDeletion.undoDeletions());
    expect(latestDeletion.visibleAnnotations.map(({ id }) => id)).toEqual([
      "annotation-a",
      "annotation-b",
    ]);
    await act(async () => vi.advanceTimersByTime(5_000));
    expect(commitDeletions).not.toHaveBeenCalled();

    await act(async () => root.unmount());
  });

  it("commits a deletion batch once when the latest undo window expires", async () => {
    vi.useFakeTimers();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => root.render(<DeletionHarness scopeKey="A" />));
    await act(async () => latestDeletion.requestDeletion("annotation-a"));
    await act(async () => latestDeletion.requestDeletion("annotation-b"));
    await act(async () => vi.advanceTimersByTime(5_000));

    expect(commitDeletions).toHaveBeenCalledOnce();
    expect(commitDeletions).toHaveBeenCalledWith(["annotation-a", "annotation-b"]);
    expect(latestDeletion.visibleAnnotations).toEqual([]);

    await act(async () => root.unmount());
  });

  it("drops a pending batch when the conversation scope changes", async () => {
    vi.useFakeTimers();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => root.render(<DeletionHarness scopeKey="A" />));
    await act(async () => latestDeletion.requestDeletion("annotation-a"));
    await act(async () => root.render(<DeletionHarness scopeKey="B" />));

    expect(latestDeletion.pendingDeletionCount).toBe(0);
    expect(latestDeletion.visibleAnnotations.map(({ id }) => id)).toEqual([
      "annotation-a",
      "annotation-b",
    ]);
    await act(async () => vi.advanceTimersByTime(5_000));
    expect(commitDeletions).not.toHaveBeenCalled();

    await act(async () => root.unmount());
  });
});

function DeletionHarness({ scopeKey }: { scopeKey: string }) {
  const [currentAnnotations, setCurrentAnnotations] = useState(annotations);
  const commit = useCallback((annotationIds: readonly string[]) => {
    commitDeletions(annotationIds);
    const deletedIds = new Set(annotationIds);
    setCurrentAnnotations((current) => current.filter(({ id }) => !deletedIds.has(id)));
  }, []);
  latestDeletion = useDeferredAnnotationDeletion(currentAnnotations, scopeKey, commit);
  return null;
}
