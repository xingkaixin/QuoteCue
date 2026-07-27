import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DraftAnnotation } from "@/features/annotations/annotation";
import { useDraftAnnotations } from "@/features/annotations/use-draft-annotations";
import type { ConversationIdentity, IdentifiedConversation } from "@/features/host-port/host-port";

const draftStorage = vi.hoisted(() => ({
  load: vi.fn(),
  save: vi.fn((_conversation: IdentifiedConversation, _annotations: DraftAnnotation[]) =>
    Promise.resolve(),
  ),
}));

vi.mock("@/features/annotations/draft-storage", () => ({
  loadDraftAnnotations: draftStorage.load,
  saveDraftAnnotations: draftStorage.save,
}));

const annotation: DraftAnnotation = {
  id: "annotation-a",
  anchor: {
    format: "exact",
    messageId: "message-a",
    quote: "selected text",
    prefix: "",
    suffix: "",
    start: 0,
    end: 13,
  },
  comment: "draft A",
};
const conversationA = identifiedConversation("A");
const conversationB = identifiedConversation("B");

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
      (conversation: IdentifiedConversation) =>
        new Promise<DraftAnnotation[]>((resolve) => pendingLoads.set(conversation.id, resolve)),
    );
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => root.render(<DraftHarness conversationIdentity={conversationA} />));
    await act(async () => pendingLoads.get("A")?.([]));
    await act(async () => latestDrafts.addAnnotation(annotation));
    draftStorage.save.mockClear();

    await act(async () => root.render(<DraftHarness conversationIdentity={conversationB} />));

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

    await act(async () => root.render(<DraftHarness conversationIdentity={conversationA} />));

    expect(latestDrafts.status).toBe("error");
    expect(latestDrafts.errorOperation).toBe("load");
    expect(draftStorage.save).not.toHaveBeenCalled();

    draftStorage.load.mockResolvedValue([annotation]);
    await act(async () => latestDrafts.retry());
    expect(latestDrafts.status).toBe("ready");
    expect(latestDrafts.annotations).toEqual([annotation]);

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

    await act(async () => root.render(<DraftHarness conversationIdentity={conversationA} />));
    await act(async () => latestDrafts.addAnnotation({ ...annotation, id: "too-early" }));
    expect(latestDrafts.annotations).toEqual([]);
    expect(draftStorage.save).not.toHaveBeenCalled();

    await act(async () => resolveLoad([annotation]));
    expect(latestDrafts.annotations).toEqual([annotation]);

    await act(async () => root.unmount());
  });

  it("keeps unidentified drafts in memory without touching storage", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () =>
      root.render(
        <DraftHarness conversationIdentity={{ kind: "unidentified", sessionKey: "session-a" }} />,
      ),
    );
    expect(latestDrafts.status).toBe("ready");
    expect(latestDrafts.isHydrated).toBe(true);

    await act(async () => latestDrafts.addAnnotation(annotation));
    await act(async () => latestDrafts.updateAnnotation(annotation.id, "memory only"));

    expect(latestDrafts.annotations).toEqual([{ ...annotation, comment: "memory only" }]);
    expect(draftStorage.load).not.toHaveBeenCalled();
    expect(draftStorage.save).not.toHaveBeenCalled();

    await act(async () => root.unmount());
  });

  it("rejects updates for unknown annotations without advancing the revision", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    draftStorage.load.mockResolvedValue([annotation]);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => root.render(<DraftHarness conversationIdentity={conversationA} />));
    const revision = latestDrafts.revision;
    draftStorage.save.mockClear();
    let didUpdate = true;

    await act(async () => {
      didUpdate = latestDrafts.updateAnnotation("missing-annotation", "lost update");
    });

    expect(didUpdate).toBe(false);
    expect(latestDrafts.revision).toBe(revision);
    expect(latestDrafts.annotations).toEqual([annotation]);
    expect(draftStorage.save).not.toHaveBeenCalled();

    await act(async () => root.unmount());
  });

  it("commits only the latest load during A to B to A navigation", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const pendingLoads = new Map<string, Array<(annotations: DraftAnnotation[]) => void>>();
    draftStorage.load.mockImplementation(
      (conversation: IdentifiedConversation) =>
        new Promise<DraftAnnotation[]>((resolve) => {
          const resolvers = pendingLoads.get(conversation.id) ?? [];
          resolvers.push(resolve);
          pendingLoads.set(conversation.id, resolvers);
        }),
    );
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => root.render(<DraftHarness conversationIdentity={conversationA} />));
    await act(async () => root.render(<DraftHarness conversationIdentity={conversationB} />));
    await act(async () => root.render(<DraftHarness conversationIdentity={conversationA} />));
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

  it("loads the latest queued edit after returning to a conversation", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const storedDrafts = new Map<string, DraftAnnotation[]>([
      ["A", []],
      ["B", []],
    ]);
    const pendingSaves: Array<{
      annotations: DraftAnnotation[];
      conversation: IdentifiedConversation;
      resolve: () => void;
    }> = [];
    draftStorage.load.mockImplementation(async (conversation: IdentifiedConversation) =>
      structuredClone(storedDrafts.get(conversation.id) ?? []),
    );
    draftStorage.save.mockImplementation(
      (conversation: IdentifiedConversation, annotations: DraftAnnotation[]) =>
        new Promise<void>((resolve) => {
          pendingSaves.push({
            annotations: structuredClone(annotations),
            conversation,
            resolve,
          });
        }),
    );
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => root.render(<DraftHarness conversationIdentity={conversationA} />));
    await act(async () => latestDrafts.addAnnotation(annotation));
    await act(async () => latestDrafts.updateAnnotation(annotation.id, "latest edit"));
    await act(async () => root.render(<DraftHarness conversationIdentity={conversationB} />));
    await act(async () => root.render(<DraftHarness conversationIdentity={conversationA} />));

    await act(async () => {
      const save = pendingSaves[0];
      storedDrafts.set(save.conversation.id, save.annotations);
      save.resolve();
    });
    await act(async () => {
      const save = pendingSaves[1];
      storedDrafts.set(save.conversation.id, save.annotations);
      save.resolve();
    });

    expect(latestDrafts.annotations).toEqual([{ ...annotation, comment: "latest edit" }]);

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

    await act(async () => root.render(<DraftHarness conversationIdentity={conversationA} />));
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

  it("preserves newer edits while removing annotations that were sent unchanged", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    draftStorage.load.mockResolvedValue([]);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => root.render(<DraftHarness conversationIdentity={conversationA} />));
    await act(async () => latestDrafts.addAnnotation(annotation));
    await act(async () =>
      latestDrafts.addAnnotation({
        ...annotation,
        id: "annotation-b",
        comment: "sent unchanged",
      }),
    );
    await act(async () =>
      latestDrafts.addAnnotation({
        ...annotation,
        id: "annotation-pending",
        comment: "pending deletion",
      }),
    );
    const sentAnnotations = latestDrafts.annotations.filter(
      ({ id }) => id !== "annotation-pending",
    );
    await act(async () => latestDrafts.updateAnnotation(annotation.id, "newer edit"));
    await act(async () =>
      latestDrafts.addAnnotation({
        ...annotation,
        id: "annotation-c",
        comment: "created after send",
      }),
    );

    await act(async () => {
      latestDrafts.removeSentAnnotations(sentAnnotations);
    });
    expect(latestDrafts.annotations).toEqual([
      { ...annotation, comment: "newer edit" },
      { ...annotation, id: "annotation-pending", comment: "pending deletion" },
      { ...annotation, id: "annotation-c", comment: "created after send" },
    ]);

    await act(async () => root.unmount());
  });

  it("preserves an annotation when its anchor format changed after sending", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    draftStorage.load.mockResolvedValue([annotation]);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => root.render(<DraftHarness conversationIdentity={conversationA} />));
    const sentAnnotation: DraftAnnotation = {
      ...annotation,
      anchor: {
        end: annotation.anchor.end,
        format: "legacy-rendered",
        messageId: annotation.anchor.messageId,
        prefix: annotation.anchor.prefix,
        quote: annotation.anchor.quote,
        start: annotation.anchor.start,
        suffix: annotation.anchor.suffix,
      },
    };

    await act(async () => latestDrafts.removeSentAnnotations([sentAnnotation]));

    expect(latestDrafts.annotations).toEqual([annotation]);

    await act(async () => root.unmount());
  });
});

function DraftHarness({ conversationIdentity }: { conversationIdentity: ConversationIdentity }) {
  latestDrafts = useDraftAnnotations(conversationIdentity);
  return null;
}

function identifiedConversation(id: string): IdentifiedConversation {
  return { kind: "identified", id };
}
