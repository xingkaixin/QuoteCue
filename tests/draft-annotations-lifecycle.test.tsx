import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DraftAnnotation } from "@/features/annotations/annotation";
import { MAX_ANNOTATION_COMMENT_LENGTH } from "@/features/annotations/draft-capacity";
import { applyDraftMutation, type DraftMutation } from "@/features/annotations/draft-mutation";
import { DraftStoreProvider } from "@/features/annotations/DraftStoreProvider";
import { canMutateDraft, useDraftAnnotations } from "@/features/annotations/use-draft-annotations";
import type { ConversationIdentity, IdentifiedConversation } from "@/features/host-port/host-port";

import { createDraftStoreDouble } from "./fixtures/memory-draft-store";

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
let draftStoreFixture = createDraftStoreDouble();

beforeEach(() => {
  draftStoreFixture = createDraftStoreDouble();
});

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("draft annotation lifecycle", () => {
  it("never writes A annotations to B while navigating", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const pendingLoads = new Map<string, (annotations: DraftAnnotation[]) => void>();
    draftStoreFixture.store.load.mockImplementation(
      (conversation: IdentifiedConversation) =>
        new Promise<DraftAnnotation[]>((resolve) => pendingLoads.set(conversation.id, resolve)),
    );
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => root.render(<DraftHarness conversationIdentity={conversationA} />));
    await act(async () => pendingLoads.get("A")?.([]));
    await act(async () => latestDrafts.addAnnotation(annotation));
    draftStoreFixture.store.mutate.mockClear();

    await act(async () => root.render(<DraftHarness conversationIdentity={conversationB} />));

    expect(draftStoreFixture.store.mutate).not.toHaveBeenCalled();

    await act(async () => root.unmount());
  });

  it("does not delete stored data after a load failure", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    draftStoreFixture.store.load.mockRejectedValue(new Error("storage unavailable"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => root.render(<DraftHarness conversationIdentity={conversationA} />));

    expect(latestDrafts.draft).toMatchObject({ status: "error", operation: "load" });
    expect(draftStoreFixture.store.mutate).not.toHaveBeenCalled();

    draftStoreFixture.store.load.mockResolvedValue([annotation]);
    await act(async () => latestDrafts.retry());
    expect(latestDrafts.draft.status).toBe("ready");
    expect(currentAnnotations()).toEqual([annotation]);

    consoleError.mockRestore();
    await act(async () => root.unmount());
  });

  it("ignores edits made before hydration without overwriting stored drafts", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    let resolveLoad: (annotations: DraftAnnotation[]) => void = () => undefined;
    draftStoreFixture.store.load.mockImplementation(
      () => new Promise<DraftAnnotation[]>((resolve) => (resolveLoad = resolve)),
    );
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => root.render(<DraftHarness conversationIdentity={conversationA} />));
    await act(async () => latestDrafts.addAnnotation({ ...annotation, id: "too-early" }));
    expect(currentAnnotations()).toEqual([]);
    expect(draftStoreFixture.store.mutate).not.toHaveBeenCalled();

    await act(async () => resolveLoad([annotation]));
    expect(currentAnnotations()).toEqual([annotation]);

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
    expect(latestDrafts.draft.status).toBe("ready");
    expect(canMutateDraft(latestDrafts.draft)).toBe(true);

    await act(async () => latestDrafts.addAnnotation(annotation));
    await act(async () => latestDrafts.updateAnnotation(annotation.id, "memory only"));

    expect(currentAnnotations()).toEqual([{ ...annotation, comment: "memory only" }]);
    expect(draftStoreFixture.store.load).not.toHaveBeenCalled();
    expect(draftStoreFixture.store.mutate).not.toHaveBeenCalled();

    await act(async () => root.unmount());
  });

  it("rejects updates for unknown annotations without saving", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    draftStoreFixture.store.load.mockResolvedValue([annotation]);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => root.render(<DraftHarness conversationIdentity={conversationA} />));
    draftStoreFixture.store.mutate.mockClear();
    let didUpdate = true;

    await act(async () => {
      didUpdate = latestDrafts.updateAnnotation("missing-annotation", "lost update");
    });

    expect(didUpdate).toBe(false);
    expect(currentAnnotations()).toEqual([annotation]);
    expect(draftStoreFixture.store.mutate).not.toHaveBeenCalled();

    await act(async () => root.unmount());
  });

  it("reports capacity failures without mutating the draft", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    draftStoreFixture.store.load.mockResolvedValue([]);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => root.render(<DraftHarness conversationIdentity={conversationA} />));
    await act(async () =>
      latestDrafts.addAnnotation({
        ...annotation,
        comment: "x".repeat(MAX_ANNOTATION_COMMENT_LENGTH + 1),
      }),
    );

    expect(latestDrafts.capacityExceeded).toBe(true);
    expect(currentAnnotations()).toEqual([]);
    expect(draftStoreFixture.store.mutate).not.toHaveBeenCalled();

    await act(async () => latestDrafts.addAnnotation(annotation));
    expect(latestDrafts.capacityExceeded).toBe(false);

    await act(async () => root.unmount());
  });

  it("commits only the latest load during A to B to A navigation", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const pendingLoads = new Map<string, Array<(annotations: DraftAnnotation[]) => void>>();
    draftStoreFixture.store.load.mockImplementation(
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
    expect(latestDrafts.draft.status).toBe("loading");
    expect(currentAnnotations()).toEqual([]);

    await act(async () => secondA?.([annotation]));
    expect(latestDrafts.draft.status).toBe("ready");
    expect(currentAnnotations()).toEqual([annotation]);
    expect(draftStoreFixture.store.mutate).not.toHaveBeenCalled();

    await act(async () => root.unmount());
  });

  it("loads the latest queued edit after returning to a conversation", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const storedDrafts = new Map<string, DraftAnnotation[]>([
      ["A", []],
      ["B", []],
    ]);
    const pendingSaves: Array<{ resolve: () => void }> = [];
    draftStoreFixture.store.load.mockImplementation(async (conversation: IdentifiedConversation) =>
      structuredClone(storedDrafts.get(conversation.id) ?? []),
    );
    // Mirrors the owner: the read-modify-write happens when the mutation is actually applied,
    // not when it is issued, so a later mutation observes the earlier one.
    draftStoreFixture.store.mutate.mockImplementation(
      (conversation: IdentifiedConversation, mutation: DraftMutation) =>
        new Promise<DraftAnnotation[]>((resolve) => {
          pendingSaves.push({
            resolve: () => {
              const current = storedDrafts.get(conversation.id) ?? [];
              const annotations = structuredClone([
                ...(applyDraftMutation(current, mutation) ?? current),
              ]);
              storedDrafts.set(conversation.id, annotations);
              resolve(annotations);
            },
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

    await act(async () => pendingSaves[0]?.resolve());
    await act(async () => pendingSaves[1]?.resolve());

    expect(currentAnnotations()).toEqual([{ ...annotation, comment: "latest edit" }]);

    await act(async () => root.unmount());
  });

  it("resends the failed mutation on retry without losing memory state", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    draftStoreFixture.store.load.mockResolvedValue([]);
    const pendingSaves: Array<{ resolve: () => void; reject: (error: Error) => void }> = [];
    draftStoreFixture.store.mutate.mockImplementation(
      () =>
        new Promise<DraftAnnotation[]>((resolve, reject) => {
          pendingSaves.push({ resolve: () => resolve([...currentAnnotations()]), reject });
        }),
    );
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => root.render(<DraftHarness conversationIdentity={conversationA} />));
    await act(async () => latestDrafts.addAnnotation(annotation));
    await act(async () => latestDrafts.updateAnnotation(annotation.id, "updated"));
    expect(draftStoreFixture.store.mutate).toHaveBeenCalledTimes(2);

    await act(async () => pendingSaves[0]?.reject(new Error("first save failed")));
    await act(async () => pendingSaves[1]?.reject(new Error("latest save failed")));
    expect(latestDrafts.draft).toMatchObject({ status: "error", operation: "save" });
    expect(currentAnnotations()[0]?.comment).toBe("updated");

    await act(async () => latestDrafts.retry());
    expect(draftStoreFixture.store.mutate).toHaveBeenCalledTimes(3);
    expect(draftStoreFixture.store.mutate).toHaveBeenLastCalledWith(conversationA, {
      kind: "update",
      annotationId: annotation.id,
      comment: "updated",
    });
    await act(async () => pendingSaves[2]?.resolve());
    expect(latestDrafts.draft.status).toBe("ready");

    consoleError.mockRestore();
    await act(async () => root.unmount());
  });

  it("settles an in-flight save after unmount without starting more storage work", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    draftStoreFixture.store.load.mockResolvedValue([]);
    let resolveSave: () => void = () => undefined;
    draftStoreFixture.store.mutate.mockImplementation(
      () => new Promise<DraftAnnotation[]>((resolve) => (resolveSave = () => resolve([]))),
    );
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => root.render(<DraftHarness conversationIdentity={conversationA} />));
    await act(async () => latestDrafts.addAnnotation(annotation));
    expect(draftStoreFixture.store.mutate).toHaveBeenCalledOnce();

    await act(async () => root.unmount());
    await act(async () => resolveSave());

    expect(draftStoreFixture.store.mutate).toHaveBeenCalledOnce();
  });

  it("preserves newer edits while removing annotations that were sent unchanged", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    draftStoreFixture.store.load.mockResolvedValue([]);
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
    const sentAnnotations = currentAnnotations().filter(({ id }) => id !== "annotation-pending");
    await act(async () => latestDrafts.updateAnnotation(annotation.id, "newer edit"));
    await act(async () =>
      latestDrafts.addAnnotation({
        ...annotation,
        id: "annotation-c",
        comment: "created after send",
      }),
    );

    await act(async () => {
      latestDrafts.removeConfirmedAnnotations(conversationA, sentAnnotations);
    });
    expect(currentAnnotations()).toEqual([
      { ...annotation, comment: "newer edit" },
      { ...annotation, id: "annotation-pending", comment: "pending deletion" },
      { ...annotation, id: "annotation-c", comment: "created after send" },
    ]);

    await act(async () => root.unmount());
  });

  it("preserves an annotation when its anchor format changed after sending", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    draftStoreFixture.store.load.mockResolvedValue([annotation]);
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

    await act(async () => latestDrafts.removeConfirmedAnnotations(conversationA, [sentAnnotation]));

    expect(currentAnnotations()).toEqual([annotation]);

    await act(async () => root.unmount());
  });
});

function DraftHarness({ conversationIdentity }: { conversationIdentity: ConversationIdentity }) {
  return (
    <DraftStoreProvider store={draftStoreFixture.store}>
      <DraftProbe conversationIdentity={conversationIdentity} />
    </DraftStoreProvider>
  );
}

function DraftProbe({ conversationIdentity }: { conversationIdentity: ConversationIdentity }) {
  latestDrafts = useDraftAnnotations(conversationIdentity);
  return null;
}

function currentAnnotations() {
  return latestDrafts.draft.status === "loading" ? [] : latestDrafts.draft.annotations;
}

function identifiedConversation(id: string): IdentifiedConversation {
  return { kind: "identified", id };
}
