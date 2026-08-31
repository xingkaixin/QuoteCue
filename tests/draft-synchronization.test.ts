import { afterEach, describe, expect, it, vi } from "vitest";

import type { DraftAnnotation } from "@/features/annotations/annotation";
import { createDraftPersistence } from "@/features/annotations/draft-persistence";
import { createDraftRuntime, type DraftRuntime } from "@/features/annotations/draft-runtime";
import { canMutateDraft } from "@/features/annotations/draft-lifecycle";
import type { DraftStore } from "@/features/annotations/draft-store";

import { createDraftStoreDouble } from "./fixtures/memory-draft-store";

const conversationA = { kind: "identified", id: "A", siteId: "chatgpt" } as const;
const conversationB = { ...conversationA, id: "B" };
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
  comment: "original",
};

afterEach(() => vi.restoreAllMocks());

describe("draft synchronization", () => {
  it("preserves failed local edits when another client changes the authoritative draft", async () => {
    const { store } = createDraftStoreDouble();
    const externalMutate = store.mutate.getMockImplementation()!;
    await externalMutate(conversationA, [{ kind: "add", annotation }]);
    const { runtime, stop } = await connect(store);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    store.mutate.mockRejectedValueOnce(new Error("save unavailable"));
    runtime.mutate(conversationA, {
      kind: "update",
      annotationId: annotation.id,
      comment: "local edit",
    });
    await vi.waitFor(() => expect(runtime.getSnapshot().draftState?.status).toBe("error"));
    const remote = { ...annotation, id: "remote" };
    await externalMutate(conversationA, [{ kind: "add", annotation: remote }]);
    await vi.waitFor(() =>
      expect(runtime.getSnapshot().draftState).toMatchObject({
        status: "error",
        operation: "save",
        annotations: [{ ...annotation, comment: "local edit" }, remote],
      }),
    );
    runtime.retry(conversationA);
    await vi.waitFor(() => expect(runtime.getSnapshot().draftState?.status).toBe("ready"));
    expect((await store.load(conversationA)).annotations).toEqual(currentAnnotations(runtime));
    stop();
  });

  it("discards a slow read after a local save and performs one trailing read for later remote changes", async () => {
    const { store } = createDraftStoreDouble();
    const externalMutate = store.mutate.getMockImplementation()!;
    await externalMutate(conversationA, [{ kind: "add", annotation }]);
    const { runtime, stop } = await connect(store);
    const delayed = pause();
    const load = store.load.getMockImplementation()!;
    store.load.mockImplementationOnce(async (identity) => {
      const snapshot = await load(identity);
      await delayed.promise;
      return snapshot;
    });
    const remote = { ...annotation, id: "remote" };
    await externalMutate(conversationA, [{ kind: "add", annotation: remote }]);
    await vi.waitFor(() => expect(store.load).toHaveBeenCalledTimes(2));
    expect(runtime.getSnapshot().draftState?.status).toBe("ready");
    runtime.mutate(conversationA, {
      kind: "update",
      annotationId: annotation.id,
      comment: "new local edit",
    });
    await vi.waitFor(() => expect(currentAnnotations(runtime)).toHaveLength(2));
    const published: string[] = [];
    const stopTracking = runtime.subscribe(() => {
      published.push(currentAnnotations(runtime)[0]?.comment ?? "");
    });
    const laterRemote = { ...annotation, id: "later-remote" };
    await externalMutate(conversationA, [{ kind: "add", annotation: laterRemote }]);
    delayed.release();
    await vi.waitFor(() =>
      expect(currentAnnotations(runtime)).toEqual([
        { ...annotation, comment: "new local edit" },
        remote,
        laterRemote,
      ]),
    );
    expect(published).not.toContain("original");
    expect(store.load).toHaveBeenCalledTimes(3);
    stopTracking();
    stop();
  });

  it("keeps a remote write that arrives before the local mutation response", async () => {
    const { store } = createDraftStoreDouble();
    const externalMutate = store.mutate.getMockImplementation()!;
    await externalMutate(conversationA, [{ kind: "add", annotation }]);
    const { runtime, stop } = await connect(store);
    const response = pause();
    store.mutate.mockImplementationOnce(async (...args) => {
      const result = await externalMutate(...args);
      await response.promise;
      return result;
    });
    runtime.mutate(conversationA, {
      kind: "update",
      annotationId: annotation.id,
      comment: "local edit",
    });
    const remote = { ...annotation, id: "remote-before-response" };
    await externalMutate(conversationA, [{ kind: "add", annotation: remote }]);
    response.release();
    await vi.waitFor(() =>
      expect(currentAnnotations(runtime)).toEqual([
        { ...annotation, comment: "local edit" },
        remote,
      ]),
    );
    stop();
  });

  it("ignores old-conversation reads and refreshes after an observation gap", async () => {
    const { store } = createDraftStoreDouble();
    const externalMutate = store.mutate.getMockImplementation()!;
    await externalMutate(conversationA, [{ kind: "add", annotation }]);
    const other = { ...annotation, id: "conversation-b-annotation" };
    await externalMutate(conversationB, [{ kind: "add", annotation: other }]);
    const { runtime, stop } = await connect(store);
    expect(store.subscribe.mock.invocationCallOrder[0]).toBeLessThan(
      store.load.mock.invocationCallOrder[0]!,
    );
    const oldRead = pause();
    const load = store.load.getMockImplementation()!;
    store.load.mockImplementationOnce(async (identity) => {
      const snapshot = await load(identity);
      await oldRead.promise;
      return snapshot;
    });
    await externalMutate(conversationA, [{ kind: "clear" }]);
    await vi.waitFor(() => expect(store.load).toHaveBeenCalledTimes(2));
    runtime.activate(conversationB);
    await vi.waitFor(() => expect(currentAnnotations(runtime)).toEqual([other]));
    oldRead.release();
    await externalMutate(conversationA, [{ kind: "add", annotation }]);
    expect(currentAnnotations(runtime)).toEqual([other]);
    expect(store.load).toHaveBeenCalledTimes(3);
    stop();
    await externalMutate(conversationB, [{ kind: "clear" }]);
    expect(store.load).toHaveBeenCalledTimes(3);
    const stopAgain = runtime.subscribe(() => undefined);
    await vi.waitFor(() => expect(currentAnnotations(runtime)).toEqual([]));
    expect(store.load).toHaveBeenCalledTimes(4);
    stopAgain();
  });

  it("does not start a trailing read after its last subscriber leaves", async () => {
    const { store } = createDraftStoreDouble();
    const externalMutate = store.mutate.getMockImplementation()!;
    await externalMutate(conversationA, [{ kind: "add", annotation }]);
    const { runtime, stop } = await connect(store);
    const delayed = pause();
    const load = store.load.getMockImplementation()!;
    store.load.mockImplementationOnce(async (identity) => {
      const snapshot = await load(identity);
      await delayed.promise;
      return snapshot;
    });
    await externalMutate(conversationA, [{ kind: "clear" }]);
    await vi.waitFor(() => expect(store.load).toHaveBeenCalledTimes(2));
    await externalMutate(conversationA, [{ kind: "add", annotation }]);
    stop();
    delayed.release();
    await delayed.promise;
    await Promise.resolve();
    expect(store.load).toHaveBeenCalledTimes(2);
    expect(currentAnnotations(runtime)).toEqual([annotation]);
  });

  it("preserves displayed annotations but disables sending when refreshing fails", async () => {
    const { store } = createDraftStoreDouble();
    const externalMutate = store.mutate.getMockImplementation()!;
    await externalMutate(conversationA, [{ kind: "add", annotation }]);
    const { runtime, stop } = await connect(store);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    store.load.mockRejectedValueOnce(new Error("read unavailable"));
    await externalMutate(conversationA, [{ kind: "clear" }]);
    await vi.waitFor(() =>
      expect(runtime.getSnapshot().draftState).toMatchObject({
        status: "error",
        operation: "load",
        annotations: [annotation],
      }),
    );
    expect(canMutateDraft(runtime.getSnapshot().draftState!)).toBe(false);
    const retried = pause();
    const load = store.load.getMockImplementation()!;
    store.load.mockImplementationOnce(async (identity) => {
      await retried.promise;
      return load(identity);
    });
    runtime.retry(conversationA);
    expect(runtime.getSnapshot().draftState).toMatchObject({
      status: "error",
      operation: "load",
      annotations: [annotation],
    });
    retried.release();
    await vi.waitFor(() =>
      expect(runtime.getSnapshot().draftState).toMatchObject({ status: "ready", annotations: [] }),
    );
    stop();
  });
});

async function connect(store: DraftStore) {
  const runtime = createDraftRuntime(createDraftPersistence(store));
  const stop = runtime.subscribe(() => undefined);
  runtime.activate(conversationA);
  await vi.waitFor(() => expect(runtime.getSnapshot().draftState?.status).toBe("ready"));
  return { runtime, stop };
}

function currentAnnotations(runtime: DraftRuntime) {
  const state = runtime.getSnapshot().draftState;
  return state && state.status !== "loading" ? state.annotations : [];
}

function pause() {
  let release: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => (release = resolve));
  return { promise, release };
}
