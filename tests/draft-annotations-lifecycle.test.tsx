import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DraftAnnotation } from "@/features/annotations/annotation";
import { useDraftAnnotations } from "@/features/annotations/use-draft-annotations";

const draftStorage = vi.hoisted(() => ({
  load: vi.fn(),
  save: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/features/annotations/draft-storage", () => ({
  loadDraftAnnotations: draftStorage.load,
  saveDraftAnnotations: draftStorage.save,
}));

const annotation: DraftAnnotation = {
  id: "annotation-a",
  anchor: {
    messageId: "message-a",
    quote: "selected text",
    prefix: "",
    suffix: "",
    start: 0,
    end: 13,
  },
  comment: "draft A",
  createdAt: 1,
};

let latestDrafts: ReturnType<typeof useDraftAnnotations>;

afterEach(() => {
  draftStorage.load.mockReset();
  draftStorage.save.mockClear();
  document.body.replaceChildren();
});

describe("draft annotation lifecycle", () => {
  it("never writes A annotations to B while navigating", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const pendingLoads = new Map<string, (annotations: DraftAnnotation[]) => void>();
    draftStorage.load.mockImplementation(
      (conversationKey: string) =>
        new Promise<DraftAnnotation[]>((resolve) => pendingLoads.set(conversationKey, resolve)),
    );
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => root.render(<DraftHarness conversationKey="A" />));
    await act(async () => pendingLoads.get("A")?.([]));
    await act(async () => latestDrafts.addAnnotation(annotation));
    draftStorage.save.mockClear();

    await act(async () => root.render(<DraftHarness conversationKey="B" />));

    expect(draftStorage.save).not.toHaveBeenCalled();

    await act(async () => root.unmount());
  });

  it("does not delete stored data after a load failure", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    draftStorage.load.mockRejectedValue(new Error("storage unavailable"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => root.render(<DraftHarness conversationKey="A" />));

    expect(latestDrafts.status).toBe("error");
    expect(latestDrafts.errorOperation).toBe("load");
    expect(draftStorage.save).not.toHaveBeenCalled();

    consoleError.mockRestore();
    await act(async () => root.unmount());
  });

  it("ignores edits made before hydration without overwriting stored drafts", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    let resolveLoad: (annotations: DraftAnnotation[]) => void = () => undefined;
    draftStorage.load.mockImplementation(
      () => new Promise<DraftAnnotation[]>((resolve) => (resolveLoad = resolve)),
    );
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => root.render(<DraftHarness conversationKey="A" />));
    await act(async () => latestDrafts.addAnnotation({ ...annotation, id: "too-early" }));
    expect(latestDrafts.annotations).toEqual([]);
    expect(draftStorage.save).not.toHaveBeenCalled();

    await act(async () => resolveLoad([annotation]));
    expect(latestDrafts.annotations).toEqual([annotation]);

    await act(async () => root.unmount());
  });

  it("commits only the latest load during A to B to A navigation", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const pendingLoads = new Map<string, Array<(annotations: DraftAnnotation[]) => void>>();
    draftStorage.load.mockImplementation(
      (conversationKey: string) =>
        new Promise<DraftAnnotation[]>((resolve) => {
          const resolvers = pendingLoads.get(conversationKey) ?? [];
          resolvers.push(resolve);
          pendingLoads.set(conversationKey, resolvers);
        }),
    );
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => root.render(<DraftHarness conversationKey="A" />));
    await act(async () => root.render(<DraftHarness conversationKey="B" />));
    await act(async () => root.render(<DraftHarness conversationKey="A" />));
    const [firstA, secondA] = pendingLoads.get("A") ?? [];
    const [loadB] = pendingLoads.get("B") ?? [];

    await act(async () => loadB?.([{ ...annotation, id: "annotation-b" }]));
    await act(async () => firstA?.([{ ...annotation, id: "stale-annotation-a" }]));
    expect(latestDrafts.status).toBe("loading");
    expect(latestDrafts.annotations).toEqual([]);

    await act(async () => secondA?.([annotation]));
    expect(latestDrafts.status).toBe("ready");
    expect(latestDrafts.annotations).toEqual([annotation]);
    expect(draftStorage.save).not.toHaveBeenCalled();

    await act(async () => root.unmount());
  });

  it("serializes revisions and retries a failed save without losing memory state", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    draftStorage.load.mockResolvedValue([]);
    const pendingSaves: Array<{ resolve: () => void; reject: (error: Error) => void }> = [];
    draftStorage.save.mockImplementation(
      () =>
        new Promise<void>((resolve, reject) => {
          pendingSaves.push({ resolve, reject });
        }),
    );
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => root.render(<DraftHarness conversationKey="A" />));
    await act(async () => latestDrafts.addAnnotation(annotation));
    await act(async () => latestDrafts.updateAnnotation(annotation.id, "updated"));
    expect(draftStorage.save).toHaveBeenCalledTimes(1);

    await act(async () => pendingSaves[0]?.reject(new Error("first save failed")));
    expect(draftStorage.save).toHaveBeenCalledTimes(2);
    await act(async () => pendingSaves[1]?.reject(new Error("latest save failed")));
    expect(latestDrafts.status).toBe("error");
    expect(latestDrafts.errorOperation).toBe("save");
    expect(latestDrafts.annotations[0]?.comment).toBe("updated");

    await act(async () => latestDrafts.retry());
    expect(draftStorage.save).toHaveBeenCalledTimes(3);
    await act(async () => pendingSaves[2]?.resolve());
    expect(latestDrafts.status).toBe("ready");

    consoleError.mockRestore();
    await act(async () => root.unmount());
  });
});

function DraftHarness({ conversationKey }: { conversationKey: string }) {
  latestDrafts = useDraftAnnotations(conversationKey);
  return null;
}
