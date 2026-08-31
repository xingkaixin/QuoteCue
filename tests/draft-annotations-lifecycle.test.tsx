import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DraftAnnotation } from "@/features/annotations/annotation";
import {
  sameConversationIdentity,
  type ConversationIdentity,
  type IdentifiedConversation,
} from "@/features/conversation/conversation-identity";
import { MAX_ANNOTATION_COMMENT_LENGTH } from "@/features/annotations/draft-capacity";
import { applyDraftMutation, type DraftMutation } from "@/features/annotations/draft-mutation";
import { DraftRuntimeProvider } from "@/features/annotations/DraftRuntimeProvider";
import { canMutateDraft, useDraftAnnotations } from "@/features/annotations/use-draft-annotations";

import { createDraftStoreDouble, draftResult } from "./fixtures/memory-draft-store";

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
  it("removes the sent snapshot from retained memory after navigation", async () => {
    const root = await mountUnidentifiedDraft();
    await act(async () => root.render(<DraftHarness conversationIdentity={conversationA} />));
    let removed = false;
    await act(async () => {
      removed = latestDrafts.removeConfirmedAnnotations(
        { kind: "unidentified", sessionKey: "session-a" },
        [annotation],
      );
    });
    expect(removed).toBe(true);
    expect(latestDrafts.retainedDraft).toBeNull();
    expect(draftStoreFixture.store.mutate).not.toHaveBeenCalled();
    expect(currentAnnotations()).toEqual([]);
    expect((await draftStoreFixture.store.load(conversationA)).annotations).toEqual([]);
    await act(async () => root.unmount());
  });

  it("cleans only the retained source after the user navigates elsewhere", async () => {
    const root = await mountUnidentifiedDraft();
    await act(async () => root.render(<DraftHarness conversationIdentity={conversationA} />));
    await act(async () => root.render(<DraftHarness conversationIdentity={conversationB} />));
    await act(async () => latestDrafts.addAnnotation({ ...annotation, id: "other" }));
    await act(async () =>
      latestDrafts.removeConfirmedAnnotations({ kind: "unidentified", sessionKey: "session-a" }, [
        annotation,
      ]),
    );
    expect((await draftStoreFixture.store.load(conversationA)).annotations).toEqual([]);
    expect(currentAnnotations()).toEqual([{ ...annotation, id: "other" }]);
    expect(latestDrafts.retainedDraft).toBeNull();
    await act(async () => root.unmount());
  });

  it("confirms the retained source while the destination draft is still loading", async () => {
    let releaseLoad: () => void = () => undefined;
    const loaded = new Promise<void>((resolve) => {
      releaseLoad = resolve;
    });
    const load = draftStoreFixture.store.load.getMockImplementation()!;
    draftStoreFixture.store.load.mockImplementationOnce(async (...args) => {
      await loaded;
      return load(...args);
    });
    const root = await mountUnidentifiedDraft();
    await act(async () => root.render(<DraftHarness conversationIdentity={conversationA} />));
    expect(latestDrafts.draft.status).toBe("loading");
    await act(async () =>
      latestDrafts.removeConfirmedAnnotations({ kind: "unidentified", sessionKey: "session-a" }, [
        annotation,
      ]),
    );
    expect(latestDrafts.retainedDraft).toBeNull();
    expect(draftStoreFixture.store.mutate).not.toHaveBeenCalled();
    await act(async () => releaseLoad());
    expect(currentAnnotations()).toEqual([]);
    expect((await draftStoreFixture.store.load(conversationA)).annotations).toEqual([]);
    await act(async () => root.unmount());
  });

  it("isolates identical conversation ids across sites", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const claudeConversationA: IdentifiedConversation = {
      ...conversationA,
      siteId: "claude",
    };
    const claudeAnnotation = { ...annotation, id: "annotation-claude", comment: "draft Claude" };
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => root.render(<DraftHarness conversationIdentity={conversationA} />));
    await act(async () => latestDrafts.addAnnotation(annotation));

    await act(async () => root.render(<DraftHarness conversationIdentity={claudeConversationA} />));
    expect(currentAnnotations()).toEqual([]);
    await act(async () => latestDrafts.addAnnotation(claudeAnnotation));

    await act(async () => root.render(<DraftHarness conversationIdentity={conversationA} />));
    expect(currentAnnotations()).toEqual([annotation]);

    await act(async () => root.unmount());
  });

  it("never writes A annotations to B while navigating", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const pendingLoads = new Map<string, (annotations: DraftAnnotation[]) => void>();
    draftStoreFixture.store.load.mockImplementation(
      (conversation: IdentifiedConversation) =>
        new Promise<ReturnType<typeof draftResult>>((resolve) =>
          pendingLoads.set(conversation.id, (annotations) => resolve(draftResult(annotations))),
        ),
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

  it("loads B without waiting for an in-flight A save", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    let resolveSave: (annotations: DraftAnnotation[]) => void = () => undefined;
    draftStoreFixture.store.load.mockResolvedValue(draftResult([]));
    draftStoreFixture.store.mutate.mockImplementation(
      () =>
        new Promise<ReturnType<typeof draftResult>>((resolve) => {
          resolveSave = (annotations) => resolve(draftResult(annotations));
        }),
    );
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => root.render(<DraftHarness conversationIdentity={conversationA} />));
    await act(async () => latestDrafts.addAnnotation(annotation));
    await act(async () => root.render(<DraftHarness conversationIdentity={conversationB} />));

    await vi.waitFor(() =>
      expect(draftStoreFixture.store.load).toHaveBeenCalledWith(conversationB),
    );
    expect(latestDrafts.draft).toMatchObject({ status: "ready", annotations: [] });

    await act(async () => resolveSave([annotation]));
    await act(async () => root.unmount());
  });

  it("saves B independently after an A save fails", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    draftStoreFixture.store.load.mockResolvedValue(draftResult([]));
    draftStoreFixture.store.mutate.mockImplementation(async (conversation, mutations) => {
      if (sameConversationIdentity(conversation, conversationA)) {
        throw new Error("A storage unavailable");
      }
      return draftResult(
        mutations.reduce<DraftAnnotation[]>(
          (annotations, mutation) => [
            ...(applyDraftMutation(annotations, mutation) ?? annotations),
          ],
          [],
        ),
      );
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const annotationB = { ...annotation, id: "annotation-b", comment: "draft B" };
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => root.render(<DraftHarness conversationIdentity={conversationA} />));
    await act(async () => latestDrafts.addAnnotation(annotation));
    await vi.waitFor(() =>
      expect(latestDrafts.draft).toMatchObject({ status: "error", operation: "save" }),
    );

    await act(async () => root.render(<DraftHarness conversationIdentity={conversationB} />));
    await act(async () => latestDrafts.addAnnotation(annotationB));

    await vi.waitFor(() =>
      expect(draftStoreFixture.store.mutate).toHaveBeenCalledWith(conversationB, [
        { kind: "add", annotation: annotationB },
      ]),
    );
    expect(latestDrafts.draft).toMatchObject({ status: "ready", annotations: [annotationB] });

    consoleError.mockRestore();
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

    draftStoreFixture.store.load.mockResolvedValue(draftResult([annotation]));
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
      () =>
        new Promise<ReturnType<typeof draftResult>>(
          (resolve) => (resolveLoad = (annotations) => resolve(draftResult(annotations))),
        ),
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

  it("retains an unidentified draft without assuming the next identity owns it", async () => {
    const root = await mountUnidentifiedDraft();
    expect(currentAnnotations()).toEqual([annotation]);

    await act(async () => root.render(<DraftHarness conversationIdentity={conversationA} />));

    expect(currentAnnotations()).toEqual([]);
    expect(latestDrafts.retainedDraft).toEqual({
      conversationIdentity: { kind: "unidentified", sessionKey: "session-a" },
      count: 1,
      status: "retained",
    });
    expect(draftStoreFixture.store.mutate).not.toHaveBeenCalled();

    await act(async () => root.unmount());
  });

  it("restores retained annotations into an existing draft only on explicit request", async () => {
    const existing = { ...annotation, id: "annotation-existing", comment: "stored draft" };
    await draftStoreFixture.store.mutate(conversationA, [{ kind: "add", annotation: existing }]);
    draftStoreFixture.store.mutate.mockClear();
    const root = await mountUnidentifiedDraft();
    await act(async () => root.render(<DraftHarness conversationIdentity={conversationA} />));

    expect(currentAnnotations()).toEqual([existing]);
    expect(draftStoreFixture.store.mutate).not.toHaveBeenCalled();
    await act(async () => expect(latestDrafts.restoreRetainedDraft()).toBe(true));
    expect(currentAnnotations()).toEqual([existing, annotation]);
    expect(latestDrafts.retainedDraft).toBeNull();
    expect(draftStoreFixture.store.mutate).toHaveBeenCalledWith(conversationA, [
      { kind: "add", annotation },
    ]);

    await act(async () => root.unmount());
  });

  it("keeps retained annotations separate through a destination load failure and retry", async () => {
    draftStoreFixture.store.load.mockRejectedValueOnce(new Error("storage unavailable"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const root = await mountUnidentifiedDraft();
    await act(async () => root.render(<DraftHarness conversationIdentity={conversationA} />));

    expect(latestDrafts.draft).toEqual({
      status: "error",
      hasUnreadableAnnotations: false,
      operation: "load",
      annotations: [],
    });
    expect(latestDrafts.retainedDraft).toMatchObject({ count: 1, status: "retained" });
    expect(latestDrafts.restoreRetainedDraft()).toBe(false);

    await act(async () => latestDrafts.retry());
    expect(latestDrafts.draft).toMatchObject({ status: "ready", annotations: [] });
    expect(draftStoreFixture.store.mutate).not.toHaveBeenCalled();
    await act(async () => latestDrafts.restoreRetainedDraft());
    expect(currentAnnotations()).toEqual([annotation]);
    expect(latestDrafts.retainedDraft).toBeNull();

    consoleError.mockRestore();
    await act(async () => root.unmount());
  });

  it("retries failed restoration in its original destination without replaying additions", async () => {
    draftStoreFixture.store.mutate.mockRejectedValueOnce(new Error("storage unavailable"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const root = await mountUnidentifiedDraft();
    await act(async () => root.render(<DraftHarness conversationIdentity={conversationA} />));
    await act(async () => latestDrafts.restoreRetainedDraft());

    expect(latestDrafts.draft).toEqual({
      status: "error",
      hasUnreadableAnnotations: false,
      operation: "save",
      annotations: [],
    });
    expect(latestDrafts.retainedDraft).toMatchObject({ count: 1, status: "save-failed" });
    expect(latestDrafts.discardRetainedDraft()).toBe(false);

    await act(async () => root.render(<DraftHarness conversationIdentity={conversationB} />));
    await act(async () => root.render(<DraftHarness conversationIdentity={conversationA} />));
    expect(currentAnnotations()).toEqual([]);
    expect(latestDrafts.retainedDraft).toMatchObject({ count: 1, status: "save-failed" });
    await act(async () => root.render(<DraftHarness conversationIdentity={conversationB} />));
    let releaseSave: () => void = () => undefined;
    const saved = new Promise<void>((resolve) => (releaseSave = resolve));
    const mutate = draftStoreFixture.store.mutate.getMockImplementation()!;
    draftStoreFixture.store.mutate.mockImplementationOnce(async (...args) => {
      await saved;
      return mutate(...args);
    });
    await act(async () => {
      expect(latestDrafts.restoreRetainedDraft()).toBe(true);
      expect(latestDrafts.restoreRetainedDraft()).toBe(false);
    });
    expect(latestDrafts.retainedDraft).toMatchObject({ count: 1, status: "restoring" });
    expect(currentAnnotations()).toEqual([]);
    await act(async () => releaseSave());
    expect(latestDrafts.retainedDraft).toBeNull();
    expect(currentAnnotations()).toEqual([]);
    expect(draftStoreFixture.store.mutate).toHaveBeenCalledTimes(2);
    expect(draftStoreFixture.store.mutate.mock.calls[1]).toEqual(
      draftStoreFixture.store.mutate.mock.calls[0],
    );
    expect((await draftStoreFixture.store.load(conversationA)).annotations).toEqual([annotation]);

    consoleError.mockRestore();
    await act(async () => root.unmount());
  });

  it("does not overwrite a retained source when another unidentified draft is left behind", async () => {
    const other = { ...annotation, id: "annotation-second-session" };
    const root = await mountUnidentifiedDraft();
    await act(async () => root.render(<DraftHarness conversationIdentity={conversationA} />));
    let releaseSave: () => void = () => undefined;
    const saved = new Promise<void>((resolve) => (releaseSave = resolve));
    const mutate = draftStoreFixture.store.mutate.getMockImplementation()!;
    draftStoreFixture.store.mutate.mockImplementationOnce(async (...args) => {
      await saved;
      return mutate(...args);
    });
    await act(async () => latestDrafts.restoreRetainedDraft());
    expect(currentAnnotations()).toEqual([]);
    await act(async () =>
      root.render(
        <DraftHarness conversationIdentity={{ kind: "unidentified", sessionKey: "session-b" }} />,
      ),
    );
    await act(async () => latestDrafts.addAnnotation(other));
    await act(async () => root.render(<DraftHarness conversationIdentity={conversationB} />));
    expect(latestDrafts.retainedDraft).toMatchObject({
      conversationIdentity: { sessionKey: "session-a" },
      status: "restoring",
    });
    await act(async () => releaseSave());
    expect(currentAnnotations()).toEqual([]);
    expect(latestDrafts.retainedDraft).toMatchObject({
      conversationIdentity: { sessionKey: "session-b" },
      status: "retained",
    });
    await act(async () => latestDrafts.restoreRetainedDraft());
    expect(currentAnnotations()).toEqual([other]);
    expect((await draftStoreFixture.store.load(conversationA)).annotations).toEqual([annotation]);
    expect(latestDrafts.retainedDraft).toBeNull();
    await act(async () => root.unmount());
  });

  it("keeps edits made after a sent snapshot when confirming retained annotations", async () => {
    const unchanged = { ...annotation, id: "annotation-unchanged" };
    const root = await mountUnidentifiedDraft();
    await act(async () => {
      latestDrafts.addAnnotation(unchanged);
      latestDrafts.updateAnnotation(annotation.id, "edited after sending");
    });
    await act(async () => root.render(<DraftHarness conversationIdentity={conversationA} />));
    await act(async () =>
      latestDrafts.removeConfirmedAnnotations({ kind: "unidentified", sessionKey: "session-a" }, [
        annotation,
        unchanged,
      ]),
    );
    expect(latestDrafts.retainedDraft).toMatchObject({ count: 1, status: "retained" });
    await act(async () => latestDrafts.restoreRetainedDraft());
    expect(currentAnnotations()).toEqual([{ ...annotation, comment: "edited after sending" }]);
    await act(async () => root.unmount());
  });

  it("explicitly discards retained annotations without changing the active draft", async () => {
    const root = await mountUnidentifiedDraft();
    await act(async () => root.render(<DraftHarness conversationIdentity={conversationA} />));
    await act(async () => latestDrafts.addAnnotation({ ...annotation, id: "destination" }));
    draftStoreFixture.store.mutate.mockClear();
    await act(async () => expect(latestDrafts.discardRetainedDraft()).toBe(true));
    expect(latestDrafts.retainedDraft).toBeNull();
    expect(currentAnnotations()).toEqual([{ ...annotation, id: "destination" }]);
    expect(draftStoreFixture.store.mutate).not.toHaveBeenCalled();
    await act(async () => root.unmount());
  });

  it("does not apply stale retained-draft actions to the next source", async () => {
    const root = await mountUnidentifiedDraft();
    await act(async () => root.render(<DraftHarness conversationIdentity={conversationA} />));
    await act(async () =>
      root.render(
        <DraftHarness conversationIdentity={{ kind: "unidentified", sessionKey: "session-b" }} />,
      ),
    );
    await act(async () => latestDrafts.addAnnotation({ ...annotation, id: "second-source" }));
    await act(async () => root.render(<DraftHarness conversationIdentity={conversationB} />));
    const restoreFirst = latestDrafts.restoreRetainedDraft;
    const discardFirst = latestDrafts.discardRetainedDraft;
    await act(async () =>
      latestDrafts.removeConfirmedAnnotations({ kind: "unidentified", sessionKey: "session-a" }, [
        annotation,
      ]),
    );
    await act(async () => {
      expect(restoreFirst()).toBe(false);
      expect(discardFirst()).toBe(false);
    });
    expect(latestDrafts.retainedDraft).toMatchObject({
      conversationIdentity: { sessionKey: "session-b" },
      count: 1,
      status: "retained",
    });
    expect(draftStoreFixture.store.mutate).not.toHaveBeenCalled();
    expect(currentAnnotations()).toEqual([]);
    await act(async () => root.unmount());
  });

  it("rejects updates for unknown annotations without saving", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    draftStoreFixture.store.load.mockResolvedValue(draftResult([annotation]));
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
    draftStoreFixture.store.load.mockResolvedValue(draftResult([]));
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
        new Promise<ReturnType<typeof draftResult>>((resolve) => {
          const resolvers = pendingLoads.get(conversation.id) ?? [];
          resolvers.push((annotations) => resolve(draftResult(annotations)));
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
      draftResult(structuredClone(storedDrafts.get(conversation.id) ?? [])),
    );
    // Mirrors the owner: the read-modify-write happens when the mutation is actually applied,
    // not when it is issued, so a later mutation observes the earlier one.
    draftStoreFixture.store.mutate.mockImplementation(
      (conversation: IdentifiedConversation, mutations: readonly DraftMutation[]) =>
        new Promise<ReturnType<typeof draftResult>>((resolve) => {
          pendingSaves.push({
            resolve: () => {
              const current = storedDrafts.get(conversation.id) ?? [];
              const annotations = structuredClone([
                ...mutations.reduce<readonly DraftAnnotation[]>(
                  (accumulatedAnnotations, mutation) =>
                    applyDraftMutation(accumulatedAnnotations, mutation) ?? accumulatedAnnotations,
                  current,
                ),
              ]);
              storedDrafts.set(conversation.id, annotations);
              resolve(draftResult(annotations));
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

  it("does not replay an acknowledged update with a later local mutation", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    let storedAnnotations = [annotation];
    const pendingSaves: Array<{ resolve: () => void }> = [];
    draftStoreFixture.store.load.mockImplementation(async () =>
      draftResult(structuredClone(storedAnnotations)),
    );
    draftStoreFixture.store.mutate.mockImplementation(
      (_conversation, mutations) =>
        new Promise<ReturnType<typeof draftResult>>((resolve) => {
          pendingSaves.push({
            resolve: () => {
              storedAnnotations = mutations.reduce<DraftAnnotation[]>(
                (current, mutation) => [...(applyDraftMutation(current, mutation) ?? current)],
                storedAnnotations,
              );
              resolve(draftResult(structuredClone(storedAnnotations)));
            },
          });
        }),
    );
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const secondAnnotation = { ...annotation, id: "annotation-b", comment: "draft B" };

    await act(async () => root.render(<DraftHarness conversationIdentity={conversationA} />));
    await act(async () => latestDrafts.updateAnnotation(annotation.id, "local edit"));
    await act(async () => latestDrafts.addAnnotation(secondAnnotation));
    await act(async () => pendingSaves[0]?.resolve());
    storedAnnotations = [
      ...(applyDraftMutation(storedAnnotations, {
        kind: "update",
        annotationId: annotation.id,
        comment: "external edit",
      }) ?? storedAnnotations),
    ];
    await vi.waitFor(() => expect(pendingSaves).toHaveLength(2));
    await act(async () => pendingSaves[1]?.resolve());

    expect(storedAnnotations).toEqual([
      { ...annotation, comment: "external edit" },
      secondAnnotation,
    ]);
    await act(async () => root.unmount());
  });

  it("resends all unconfirmed mutations on retry without losing memory state", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    draftStoreFixture.store.load.mockResolvedValue(draftResult([]));
    const pendingSaves: Array<{ resolve: () => void; reject: (error: Error) => void }> = [];
    draftStoreFixture.store.mutate.mockImplementation(
      () =>
        new Promise<ReturnType<typeof draftResult>>((resolve, reject) => {
          pendingSaves.push({
            resolve: () => resolve(draftResult([...currentAnnotations()])),
            reject,
          });
        }),
    );
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => root.render(<DraftHarness conversationIdentity={conversationA} />));
    await act(async () => latestDrafts.addAnnotation(annotation));
    await act(async () => latestDrafts.updateAnnotation(annotation.id, "updated"));
    expect(draftStoreFixture.store.mutate).toHaveBeenCalledOnce();

    await act(async () => pendingSaves[0]?.reject(new Error("first save failed")));
    expect(latestDrafts.draft).toMatchObject({ status: "error", operation: "save" });
    expect(currentAnnotations()[0]?.comment).toBe("updated");

    await act(async () => latestDrafts.retry());
    expect(draftStoreFixture.store.mutate).toHaveBeenCalledTimes(2);
    expect(draftStoreFixture.store.mutate).toHaveBeenLastCalledWith(conversationA, [
      { kind: "add", annotation },
      {
        kind: "update",
        annotationId: annotation.id,
        comment: "updated",
      },
    ]);
    await act(async () => pendingSaves[1]?.resolve());
    expect(latestDrafts.draft.status).toBe("ready");

    consoleError.mockRestore();
    await act(async () => root.unmount());
  });

  it("keeps failed unsaved annotations visible after returning to a conversation", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    draftStoreFixture.store.load.mockResolvedValue(draftResult([]));
    draftStoreFixture.store.mutate.mockRejectedValue(new Error("storage unavailable"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => root.render(<DraftHarness conversationIdentity={conversationA} />));
    await act(async () => latestDrafts.addAnnotation(annotation));
    await vi.waitFor(() =>
      expect(latestDrafts.draft).toMatchObject({ status: "error", operation: "save" }),
    );

    await act(async () => root.render(<DraftHarness conversationIdentity={conversationB} />));
    await act(async () => root.render(<DraftHarness conversationIdentity={conversationA} />));

    expect(latestDrafts.draft).toEqual({
      status: "error",
      hasUnreadableAnnotations: false,
      operation: "save",
      annotations: [annotation],
    });

    consoleError.mockRestore();
    await act(async () => root.unmount());
  });

  it("preserves a failed edit when a later mutation saves successfully", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const storedAnnotations = [annotation];
    draftStoreFixture.store.load.mockResolvedValue(draftResult(storedAnnotations));
    draftStoreFixture.store.mutate
      .mockRejectedValueOnce(new Error("storage unavailable"))
      .mockImplementationOnce(async (_conversation, mutations) =>
        draftResult(
          mutations.reduce<DraftAnnotation[]>(
            (annotations, mutation) => [
              ...(applyDraftMutation(annotations, mutation) ?? annotations),
            ],
            storedAnnotations,
          ),
        ),
      );
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => root.render(<DraftHarness conversationIdentity={conversationA} />));
    await act(async () => latestDrafts.updateAnnotation(annotation.id, "local edit"));
    expect(latestDrafts.draft).toMatchObject({ status: "error", operation: "save" });

    await act(async () =>
      latestDrafts.addAnnotation({ ...annotation, id: "annotation-b", comment: "draft B" }),
    );

    expect(currentAnnotations()).toEqual([
      { ...annotation, comment: "local edit" },
      { ...annotation, id: "annotation-b", comment: "draft B" },
    ]);

    await act(async () => root.unmount());
  });

  it("settles an in-flight save after unmount without starting more storage work", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    draftStoreFixture.store.load.mockResolvedValue(draftResult([]));
    let resolveSave: () => void = () => undefined;
    draftStoreFixture.store.mutate.mockImplementation(
      () =>
        new Promise<ReturnType<typeof draftResult>>(
          (resolve) => (resolveSave = () => resolve(draftResult([]))),
        ),
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

  it("scopes a failed confirmation cleanup to its source conversation", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    draftStoreFixture.store.load.mockResolvedValue(draftResult([]));
    draftStoreFixture.store.mutate
      .mockRejectedValueOnce(new Error("cleanup unavailable"))
      .mockResolvedValue(draftResult([]));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => root.render(<DraftHarness conversationIdentity={conversationB} />));
    await act(async () => {
      latestDrafts.removeConfirmedAnnotations(conversationA, [annotation]);
    });

    await vi.waitFor(() =>
      expect(consoleError).toHaveBeenCalledWith(
        "[QuoteCue] Failed to save draft annotations",
        expect.any(Error),
      ),
    );
    expect(latestDrafts.draft.status).toBe("ready");

    await act(async () => root.render(<DraftHarness conversationIdentity={conversationA} />));
    expect(latestDrafts.draft).toMatchObject({ status: "error", operation: "save" });

    await act(async () => latestDrafts.retry());
    await vi.waitFor(() => expect(draftStoreFixture.store.mutate).toHaveBeenCalledTimes(2));
    expect(latestDrafts.draft.status).toBe("ready");
    expect(draftStoreFixture.store.mutate.mock.calls[1]).toEqual(
      draftStoreFixture.store.mutate.mock.calls[0],
    );

    await act(async () => root.unmount());
  });

  it("preserves newer edits while removing annotations that were sent unchanged", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
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
    draftStoreFixture.store.load.mockResolvedValue(draftResult([annotation]));
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
    <DraftRuntimeProvider store={draftStoreFixture.store}>
      <DraftProbe conversationIdentity={conversationIdentity} />
    </DraftRuntimeProvider>
  );
}

function DraftProbe({ conversationIdentity }: { conversationIdentity: ConversationIdentity }) {
  latestDrafts = useDraftAnnotations(conversationIdentity);
  return null;
}

function currentAnnotations() {
  return latestDrafts.draft.status === "loading" ? [] : latestDrafts.draft.annotations;
}

async function mountUnidentifiedDraft() {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () =>
    root.render(
      <DraftHarness conversationIdentity={{ kind: "unidentified", sessionKey: "session-a" }} />,
    ),
  );
  await act(async () => latestDrafts.addAnnotation(annotation));
  return root;
}

function identifiedConversation(id: string): IdentifiedConversation {
  return { kind: "identified", id, siteId: "chatgpt" };
}
