import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DraftAnnotation } from "@/features/annotations/annotation";
import {
  MAX_ANNOTATION_COMMENT_LENGTH,
  MAX_DRAFT_ANNOTATIONS,
} from "@/features/annotations/draft-capacity";
import { createDraftPersistence } from "@/features/annotations/draft-persistence";
import { createDraftRuntime, visibleDraftSnapshot } from "@/features/annotations/draft-runtime";
import { createDraftOwner } from "@/features/annotations/draft-owner";
import { createBrowserDraftStore } from "@/features/annotations/draft-store-client";
import type { DraftOwnerRequest } from "@/features/annotations/draft-owner-protocol";

const extensionStorage = vi.hoisted(() => {
  let values: Record<string, unknown> = {};
  const listeners = new Set<(changes: Record<string, unknown>, areaName: string) => void>();
  const changed = (keys: readonly string[]) => {
    if (keys.length > 0) {
      const changes = Object.fromEntries(keys.map((key) => [key, {}]));
      for (const listener of listeners) listener(changes, "local");
    }
  };

  return {
    get: vi.fn(async (keys: string[] | null) =>
      keys === null
        ? structuredClone(values)
        : Object.fromEntries(keys.filter((key) => key in values).map((key) => [key, values[key]])),
    ),
    getKeys: vi.fn(async () => Object.keys(values)),
    set: vi.fn(async (updates: Record<string, unknown>) => {
      Object.assign(values, updates);
      changed(Object.keys(updates));
    }),
    remove: vi.fn(async (keys: string | string[]) => {
      const removed: string[] = [];
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        if (key in values) removed.push(key);
        delete values[key];
      }
      changed(removed);
    }),
    onChanged: {
      addListener: (listener: (changes: Record<string, unknown>, areaName: string) => void) =>
        listeners.add(listener),
      removeListener: (listener: (changes: Record<string, unknown>, areaName: string) => void) =>
        listeners.delete(listener),
    },
    reset(nextValues: Record<string, unknown> = {}) {
      values = structuredClone(nextValues);
      listeners.clear();
      this.get.mockClear();
      this.getKeys.mockClear();
      this.set.mockClear();
      this.remove.mockClear();
    },
    snapshot() {
      return structuredClone(values);
    },
    keys() {
      return Object.keys(values);
    },
  };
});
const sendMessage = vi.hoisted(() => vi.fn());

vi.mock("wxt/browser", () => ({
  browser: {
    runtime: { sendMessage },
    storage: { local: extensionStorage, onChanged: extensionStorage.onChanged },
  },
}));

const currentKey = "quotecue:draft:chatgpt:A";
const unscopedKey = "quotecue:draft:A";
const legacyKey = "askgpt:draft:A";
const NOW = Date.UTC(2026, 6, 27);
const DAY_MS = 24 * 60 * 60 * 1_000;
const conversationA = { kind: "identified", id: "A", siteId: "chatgpt" } as const;
const unmarkedAnchor = {
  messageId: "message-a",
  quote: "selected text",
  prefix: "before",
  suffix: "after",
  start: 4,
  end: 17,
};
const unmarkedAnnotation = {
  id: "annotation-a",
  anchor: unmarkedAnchor,
  comment: "draft A",
};
const annotation: DraftAnnotation = {
  ...unmarkedAnnotation,
  anchor: { ...unmarkedAnchor, format: "exact" },
};
const legacyAnnotation: DraftAnnotation = {
  ...unmarkedAnnotation,
  anchor: { ...unmarkedAnchor, format: "legacy-rendered" },
};
const envelope = { version: 3, annotations: [annotation], updatedAt: NOW };
const legacyEnvelope = { version: 3, annotations: [legacyAnnotation], updatedAt: NOW };
let draftStore = createDraftOwner();

beforeEach(() => {
  extensionStorage.reset();
  draftStore = createDraftOwner();
  sendMessage.mockImplementation(async (message: DraftOwnerRequest) =>
    message.kind === "load"
      ? { kind: "loaded", draft: await draftStore.load(message.conversation) }
      : {
          kind: "mutated",
          result: await draftStore.mutate(message.conversation, message.mutations),
        },
  );
  vi.spyOn(Date, "now").mockReturnValue(NOW);
});

afterEach(() => vi.restoreAllMocks());

describe("draft storage", () => {
  it("refreshes another subscribed client after send confirmation removes their shared draft", async () => {
    extensionStorage.reset({ [currentKey]: envelope });
    const first = createDraftRuntime(createDraftPersistence(createBrowserDraftStore()));
    const second = createDraftRuntime(createDraftPersistence(createBrowserDraftStore()));
    const stopFirst = first.subscribe(() => undefined);
    const states: (string | undefined)[] = [];
    const stopSecond = second.subscribe(() => states.push(second.getSnapshot().draftState?.status));
    first.activate(conversationA);
    second.activate(conversationA);
    await vi.waitFor(() => {
      expect(first.getSnapshot().draftState).toMatchObject({
        status: "ready",
        annotations: [annotation],
      });
      expect(second.getSnapshot().draftState).toMatchObject({
        status: "ready",
        annotations: [annotation],
      });
    });
    states.length = 0;
    first.removeConfirmed(conversationA, conversationA, [annotation]);
    await vi.waitFor(() =>
      expect(second.getSnapshot().draftState).toMatchObject({ status: "ready", annotations: [] }),
    );
    expect(states).not.toContain("loading");
    expect(extensionStorage.snapshot()).toEqual({});
    stopFirst();
    stopSecond();
  });

  it.each([{ readable: [] }, { readable: [annotation] }])(
    "recovers an unreadable draft through the runtime clear path: %#",
    async ({ readable }) => {
      extensionStorage.reset({
        [currentKey]: { ...envelope, annotations: [...readable, { id: "unreadable" }] },
      });
      const runtime = createDraftRuntime(createDraftPersistence(createBrowserDraftStore()));
      const unsubscribe = runtime.subscribe(() => undefined);
      runtime.activate(conversationA);
      await vi.waitFor(() =>
        expect(runtime.getSnapshot().draftState).toMatchObject({
          status: "ready",
          hasUnreadableAnnotations: true,
        }),
      );
      expect(
        runtime.mutate(conversationA, {
          kind: "add",
          annotation: { ...annotation, id: "new" },
        }),
      ).toBe(false);
      expect(runtime.getSnapshot().draftState).toMatchObject({
        status: "ready",
        annotations: readable,
      });
      expect(runtime.mutate(conversationA, { kind: "clear" })).toBe(true);
      await vi.waitFor(() => expect(extensionStorage.snapshot()).toEqual({}));
      expect(runtime.getSnapshot().draftState).toMatchObject({
        status: "ready",
        annotations: [],
        hasUnreadableAnnotations: false,
      });
      unsubscribe();
    },
  );

  it("rolls back a cross-tab capacity rejection and persists subsequent deletion", async () => {
    const annotations = Array.from({ length: MAX_DRAFT_ANNOTATIONS - 1 }, (_, index) => ({
      ...annotation,
      id: `stored-${index}`,
    }));
    extensionStorage.reset({ [currentKey]: { ...envelope, annotations } });
    const runtime = createDraftRuntime(createDraftPersistence(createBrowserDraftStore()));
    const unsubscribe = runtime.subscribe(() => undefined);
    runtime.activate(conversationA);
    await vi.waitFor(() => expect(runtime.getSnapshot().draftState?.status).toBe("ready"));
    await draftStore.mutate(conversationA, [{ kind: "add", annotation }]);
    runtime.mutate(conversationA, { kind: "add", annotation: { ...annotation, id: "rejected" } });
    await vi.waitFor(() => expect(runtime.getSnapshot().capacityExceeded).toBe(true));
    expect(runtime.getSnapshot().draftState).toMatchObject({
      status: "ready",
      annotations: [...annotations, annotation],
    });
    runtime.mutate(conversationA, { kind: "discard", annotationIds: [annotation.id] });
    await vi.waitFor(() =>
      expect(extensionStorage.snapshot()[currentKey]).toMatchObject({ annotations }),
    );
    expect(runtime.getSnapshot().capacityExceeded).toBe(false);
    unsubscribe();
  });

  it("retains only rejected restore items and can restore them after freeing capacity", async () => {
    const stored = Array.from({ length: MAX_DRAFT_ANNOTATIONS - 2 }, (_, index) => ({
      ...annotation,
      id: `stored-${index}`,
    }));
    extensionStorage.reset({ [currentKey]: { ...envelope, annotations: stored } });
    const runtime = createDraftRuntime(createDraftPersistence(createBrowserDraftStore()));
    const unsubscribe = runtime.subscribe(() => undefined);
    const unidentified = { kind: "unidentified", sessionKey: "source-session" } as const;
    const second = { ...annotation, id: "second-retained" };
    runtime.activate(unidentified);
    runtime.mutate(unidentified, { kind: "add", annotation });
    runtime.mutate(unidentified, { kind: "add", annotation: second });
    runtime.activate(conversationA);
    await vi.waitFor(() => expect(runtime.getSnapshot().draftState?.status).toBe("ready"));
    await draftStore.mutate(conversationA, [
      { kind: "add", annotation: { ...annotation, id: "other-tab" } },
    ]);

    expect(runtime.restoreRetainedDraft(conversationA, unidentified.sessionKey)).toBe(true);
    expect(runtime.restoreRetainedDraft(conversationA, unidentified.sessionKey)).toBe(false);
    await vi.waitFor(() =>
      expect(visibleDraftSnapshot(runtime.getSnapshot(), conversationA)).toMatchObject({
        capacityExceeded: true,
        retainedDraft: { count: 1, status: "retained" },
      }),
    );
    expect((await draftStore.load(conversationA)).annotations).toHaveLength(MAX_DRAFT_ANNOTATIONS);
    expect((await draftStore.load(conversationA)).annotations).toContainEqual(annotation);
    expect((await draftStore.load(conversationA)).annotations).not.toContainEqual(second);
    expect(runtime.restoreRetainedDraft(conversationA, unidentified.sessionKey)).toBe(false);

    runtime.mutate(conversationA, { kind: "discard", annotationIds: ["other-tab"] });
    await vi.waitFor(() =>
      expect(visibleDraftSnapshot(runtime.getSnapshot(), conversationA).draft).toMatchObject({
        status: "ready",
      }),
    );
    expect(runtime.restoreRetainedDraft(conversationA, unidentified.sessionKey)).toBe(true);
    await vi.waitFor(() =>
      expect(visibleDraftSnapshot(runtime.getSnapshot(), conversationA).retainedDraft).toBeNull(),
    );
    expect((await draftStore.load(conversationA)).annotations).toContainEqual(second);
    unsubscribe();
  });

  it("continues through a rejected mutation to an explicit clear in the same batch", async () => {
    extensionStorage.reset({
      [currentKey]: { ...envelope, annotations: [annotation, { id: "unreadable" }] },
    });
    await expect(
      draftStore.mutate(conversationA, [
        { kind: "add", annotation: { ...annotation, id: "new" } },
        { kind: "clear" },
      ]),
    ).resolves.toEqual({
      status: "rejected",
      reason: "unreadable",
      annotations: [],
      hasUnreadableAnnotations: false,
    });
    expect(extensionStorage.snapshot()).toEqual({});
  });

  it("loads and explicitly clears a wholly unreadable draft", async () => {
    extensionStorage.reset({ [currentKey]: { ...envelope, annotations: [{ id: "unreadable" }] } });
    await expect(draftStore.load(conversationA)).resolves.toEqual({
      annotations: [],
      hasUnreadableAnnotations: true,
    });
    await expect(draftStore.mutate(conversationA, [{ kind: "clear" }])).resolves.toEqual({
      status: "ok",
      annotations: [],
      hasUnreadableAnnotations: false,
    });
    expect(extensionStorage.snapshot()).toEqual({});
  });

  it("rejects oversized mutations before writing storage", async () => {
    await expect(
      draftStore.mutate(conversationA, [
        {
          kind: "add",
          annotation: {
            ...annotation,
            comment: "x".repeat(MAX_ANNOTATION_COMMENT_LENGTH + 1),
          },
        },
      ]),
    ).resolves.toMatchObject({ status: "rejected", reason: "capacity", annotations: [] });

    expect(extensionStorage.set).not.toHaveBeenCalled();
  });

  it("scopes startup cleanup to each store instance", async () => {
    extensionStorage.reset({ [currentKey]: envelope });
    extensionStorage.getKeys.mockClear();
    const firstOwner = createDraftOwner();
    const conversationB = { ...conversationA, id: "B" };

    await firstOwner.load(conversationA);
    await vi.waitFor(() => expect(extensionStorage.getKeys).toHaveBeenCalledOnce());
    await firstOwner.load(conversationB);

    await createDraftOwner().load(conversationA);
    await vi.waitFor(() => expect(extensionStorage.getKeys).toHaveBeenCalledTimes(2));
  });

  it.each(["A", "B"])("saves conversation %s while the startup scan is pending", async (id) => {
    let resolveKeys: (keys: string[]) => void = () => undefined;
    extensionStorage.getKeys.mockImplementationOnce(
      () => new Promise<string[]>((resolve) => (resolveKeys = resolve)),
    );
    const owner = createDraftOwner();
    await owner.load(conversationA);
    expect(extensionStorage.getKeys).toHaveBeenCalledOnce();
    const saving = owner.mutate({ ...conversationA, id }, [{ kind: "add", annotation }]);

    try {
      await vi.waitFor(() => expect(extensionStorage.set).toHaveBeenCalledOnce());
    } finally {
      resolveKeys(extensionStorage.keys());
      await saving;
    }
  });

  it("expires the loaded draft before conservative background cleanup", async () => {
    const expiredKey = "quotecue:draft:expired";
    const recentKey = "quotecue:draft:recent";
    const unmarkedKey = "quotecue:draft:without-updated-at";
    const staleEnvelope = { ...envelope, updatedAt: NOW - 31 * DAY_MS };
    const unmarkedEnvelope = { version: 3, annotations: [annotation] };
    extensionStorage.reset({
      [currentKey]: staleEnvelope,
      [expiredKey]: staleEnvelope,
      [recentKey]: { ...envelope, updatedAt: NOW - 29 * DAY_MS },
      [unmarkedKey]: unmarkedEnvelope,
      "quotecue:draft:new-chat:current-orphan": envelope,
      "askgpt:draft:new-chat:legacy-orphan": [annotation],
      "unrelated-key": "preserved",
    });
    let resolveKeys: (keys: string[]) => void = () => undefined;
    extensionStorage.getKeys.mockImplementationOnce(
      () => new Promise<string[]>((resolve) => (resolveKeys = resolve)),
    );
    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => undefined);

    await expect(draftStore.load(conversationA)).resolves.toMatchObject({ annotations: [] });
    expect(extensionStorage.snapshot()).not.toHaveProperty(currentKey);

    resolveKeys(extensionStorage.keys());
    await vi.waitFor(() => {
      expect(extensionStorage.snapshot()).toEqual({
        [recentKey]: { ...envelope, updatedAt: NOW - 29 * DAY_MS },
        [unmarkedKey]: unmarkedEnvelope,
        "unrelated-key": "preserved",
      });
    });
    expect(extensionStorage.getKeys).toHaveBeenCalledOnce();
    expect(extensionStorage.get).not.toHaveBeenCalledWith(null);
    expect(consoleInfo).toHaveBeenCalledWith("[QuoteCue] Removed 1 expired annotation draft");
  });

  it("loads different conversations independently", async () => {
    const conversationB = { ...conversationA, id: "B" };
    const keyB = "quotecue:draft:chatgpt:B";
    let resolveA: (value: Record<string, unknown>) => void = () => undefined;
    extensionStorage.get
      .mockImplementationOnce(
        () =>
          new Promise<Record<string, unknown>>((resolve) => {
            resolveA = resolve;
          }),
      )
      .mockResolvedValueOnce({});
    const owner = createDraftOwner();

    const loadingA = owner.load(conversationA);
    const loadingB = owner.load(conversationB);

    await expect(loadingB).resolves.toMatchObject({ annotations: [] });
    expect(extensionStorage.get).toHaveBeenCalledWith([keyB, "quotecue:draft:B", "askgpt:draft:B"]);

    resolveA({});
    await loadingA;
  });

  it("loads the current versioned envelope", async () => {
    extensionStorage.reset({ [currentKey]: envelope });

    await expect(draftStore.load(conversationA)).resolves.toMatchObject({
      annotations: [annotation],
    });
    expect(extensionStorage.snapshot()).toEqual({ [currentKey]: envelope });
  });

  it("migrates an unscoped draft into the current site", async () => {
    extensionStorage.reset({ [unscopedKey]: envelope });

    await expect(draftStore.load(conversationA)).resolves.toMatchObject({
      annotations: [annotation],
    });
    expect(extensionStorage.snapshot()).toEqual({ [currentKey]: envelope });
  });

  it("isolates equal conversation ids from different sites", async () => {
    const claudeConversation = { ...conversationA, siteId: "claude" } as const;
    const claudeKey = "quotecue:draft:claude:A";
    const claudeAnnotation = { ...annotation, id: "annotation-claude", comment: "Claude draft" };

    await draftStore.mutate(conversationA, [{ kind: "add", annotation }]);
    await draftStore.mutate(claudeConversation, [{ kind: "add", annotation: claudeAnnotation }]);

    expect(await draftStore.load(conversationA)).toMatchObject({ annotations: [annotation] });
    expect(await draftStore.load(claudeConversation)).toMatchObject({
      annotations: [claudeAnnotation],
    });
    expect(extensionStorage.snapshot()).toEqual({
      [currentKey]: envelope,
      [claudeKey]: { ...envelope, annotations: [claudeAnnotation] },
    });
  });

  it("deduplicates repeated annotation ids in the current envelope", async () => {
    extensionStorage.reset({
      [currentKey]: { version: 3, annotations: [annotation, annotation] },
    });

    await expect(draftStore.load(conversationA)).resolves.toMatchObject({
      annotations: [annotation],
    });
    expect(extensionStorage.snapshot()).toEqual({ [currentKey]: envelope });
  });

  it("marks version 1 rendered quotes and does not migrate them twice", async () => {
    const renderedAnnotation = {
      ...unmarkedAnnotation,
      anchor: { ...unmarkedAnchor, end: 9, quote: "alpha beta", start: 0 },
    };
    const migratedAnnotation = {
      ...renderedAnnotation,
      anchor: { ...renderedAnnotation.anchor, format: "legacy-rendered" },
    };
    const migratedEnvelope = {
      version: 3,
      annotations: [migratedAnnotation],
      updatedAt: NOW,
    };
    extensionStorage.reset({
      [currentKey]: { version: 1, annotations: [renderedAnnotation] },
    });

    await expect(draftStore.load(conversationA)).resolves.toMatchObject({
      annotations: [migratedAnnotation],
    });
    expect(extensionStorage.snapshot()).toEqual({ [currentKey]: migratedEnvelope });

    extensionStorage.set.mockClear();
    await expect(draftStore.load(conversationA)).resolves.toMatchObject({
      annotations: [migratedAnnotation],
    });
    expect(extensionStorage.set).not.toHaveBeenCalled();
  });

  it("marks unidentifiable version 2 anchors as legacy-rendered", async () => {
    extensionStorage.reset({
      [currentKey]: { version: 2, annotations: [unmarkedAnnotation] },
    });

    await expect(draftStore.load(conversationA)).resolves.toMatchObject({
      annotations: [legacyAnnotation],
    });
    expect(extensionStorage.snapshot()).toEqual({ [currentKey]: legacyEnvelope });
  });

  it("recognizes version 2 anchors with displayQuote as exact", async () => {
    const storedTableAnnotation = {
      ...unmarkedAnnotation,
      anchor: {
        ...unmarkedAnchor,
        displayQuote: "alpha beta",
        quote: "alphabeta",
      },
    };
    const tableAnnotation: DraftAnnotation = {
      ...storedTableAnnotation,
      anchor: { ...storedTableAnnotation.anchor, format: "exact" },
    };
    const tableEnvelope = { version: 3, annotations: [tableAnnotation], updatedAt: NOW };
    extensionStorage.reset({
      [currentKey]: { version: 2, annotations: [storedTableAnnotation] },
    });

    await expect(draftStore.load(conversationA)).resolves.toMatchObject({
      annotations: [tableAnnotation],
    });
    expect(extensionStorage.snapshot()).toEqual({ [currentKey]: tableEnvelope });
  });

  it("migrates raw arrays while preserving valid items and removing obsolete fields", async () => {
    extensionStorage.reset({
      [currentKey]: [
        { ...unmarkedAnnotation, createdAt: 1 },
        { ...unmarkedAnnotation, createdAt: 2 },
      ],
    });

    await expect(draftStore.load(conversationA)).resolves.toMatchObject({
      annotations: [legacyAnnotation],
    });
    expect(extensionStorage.snapshot()).toEqual({ [currentKey]: legacyEnvelope });
  });

  it("writes the new envelope before removing a legacy key", async () => {
    extensionStorage.reset({ [legacyKey]: [{ ...unmarkedAnnotation, createdAt: 1 }] });

    await expect(draftStore.load(conversationA)).resolves.toMatchObject({
      annotations: [legacyAnnotation],
    });
    expect(extensionStorage.snapshot()).toEqual({ [currentKey]: legacyEnvelope });
  });

  it("keeps legacy data when the migration write fails", async () => {
    const legacyDraft = [{ ...unmarkedAnnotation, createdAt: 1 }];
    extensionStorage.reset({ [legacyKey]: legacyDraft });
    extensionStorage.set.mockRejectedValueOnce(new Error("write failed"));

    await expect(draftStore.load(conversationA)).rejects.toThrow("write failed");
    expect(extensionStorage.snapshot()).toEqual({ [legacyKey]: legacyDraft });
  });

  it("retries legacy cleanup without blocking a successfully migrated draft", async () => {
    const legacyDraft = [{ ...unmarkedAnnotation, createdAt: 1 }];
    extensionStorage.reset({ [legacyKey]: legacyDraft });
    extensionStorage.remove.mockRejectedValueOnce(new Error("remove failed"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(draftStore.load(conversationA)).resolves.toMatchObject({
      annotations: [legacyAnnotation],
    });
    expect(extensionStorage.snapshot()).toEqual({
      [currentKey]: legacyEnvelope,
      [legacyKey]: legacyDraft,
    });
    await expect(draftStore.load(conversationA)).resolves.toMatchObject({
      annotations: [legacyAnnotation],
    });
    expect(extensionStorage.snapshot()).toEqual({ [currentKey]: legacyEnvelope });

    consoleError.mockRestore();
  });

  it("preserves unknown versions and wholly invalid drafts", async () => {
    const unknownVersion = { version: 4, annotations: [annotation] };
    extensionStorage.reset({ [currentKey]: unknownVersion });

    await expect(draftStore.load(conversationA)).rejects.toThrow(
      "Unsupported draft storage version",
    );
    expect(extensionStorage.snapshot()).toEqual({ [currentKey]: unknownVersion });

    const malformedDraft = [{ id: 42, anchor: null }];
    extensionStorage.reset({ [currentKey]: malformedDraft });
    await expect(draftStore.load(conversationA)).resolves.toEqual({
      annotations: [],
      hasUnreadableAnnotations: true,
    });
    expect(extensionStorage.snapshot()).toEqual({ [currentKey]: malformedDraft });

    const malformedDisplayQuote = {
      version: 2,
      annotations: [{ ...unmarkedAnnotation, anchor: { ...unmarkedAnchor, displayQuote: 42 } }],
    };
    extensionStorage.reset({ [currentKey]: malformedDisplayQuote });
    await expect(draftStore.load(conversationA)).resolves.toEqual({
      annotations: [],
      hasUnreadableAnnotations: true,
    });
    expect(extensionStorage.snapshot()).toEqual({ [currentKey]: malformedDisplayQuote });

    const missingFormat = {
      version: 3,
      annotations: [unmarkedAnnotation],
    };
    extensionStorage.reset({ [currentKey]: missingFormat });
    await expect(draftStore.load(conversationA)).resolves.toEqual({
      annotations: [],
      hasUnreadableAnnotations: true,
    });
    expect(extensionStorage.snapshot()).toEqual({ [currentKey]: missingFormat });
  });

  it("does not overwrite a current draft containing an unreadable annotation", async () => {
    const unreadableAnnotation = {
      ...unmarkedAnnotation,
      id: "unreadable",
      anchor: { ...unmarkedAnchor, format: "unknown" },
    };
    const storedEnvelope = {
      version: 3,
      annotations: [annotation, unreadableAnnotation],
    };
    extensionStorage.reset({ [currentKey]: storedEnvelope });

    await expect(draftStore.load(conversationA)).resolves.toMatchObject({
      annotations: [annotation],
    });
    expect(extensionStorage.snapshot()).toEqual({ [currentKey]: storedEnvelope });
  });

  it("rejects mutations that would overwrite an unreadable annotation", async () => {
    const unreadableAnnotation = {
      ...unmarkedAnnotation,
      id: "unreadable",
      anchor: { ...unmarkedAnchor, format: "unknown" },
    };
    const storedEnvelope = {
      version: 3,
      annotations: [annotation, unreadableAnnotation],
    };
    extensionStorage.reset({ [currentKey]: storedEnvelope });

    await expect(
      draftStore.mutate(conversationA, [
        { kind: "update", annotationId: annotation.id, comment: "unsafe update" },
      ]),
    ).resolves.toMatchObject({
      status: "rejected",
      reason: "unreadable",
      annotations: [annotation],
    });
    expect(extensionStorage.snapshot()).toEqual({ [currentKey]: storedEnvelope });
  });

  it("allows idempotent mutations without rewriting unreadable annotations", async () => {
    const unreadableAnnotation = {
      ...unmarkedAnnotation,
      id: "unreadable",
      anchor: { ...unmarkedAnchor, format: "unknown" },
    };
    const storedEnvelope = {
      version: 3,
      annotations: [annotation, unreadableAnnotation],
    };
    extensionStorage.reset({ [currentKey]: storedEnvelope });

    await expect(
      draftStore.mutate(conversationA, [{ kind: "add", annotation }]),
    ).resolves.toMatchObject({ annotations: [annotation] });
    expect(extensionStorage.snapshot()).toEqual({ [currentKey]: storedEnvelope });
  });

  it("allows an explicit clear to remove unreadable annotations", async () => {
    const unreadableAnnotation = {
      ...unmarkedAnnotation,
      id: "unreadable",
      anchor: { ...unmarkedAnchor, format: "unknown" },
    };
    extensionStorage.reset({
      [currentKey]: { version: 3, annotations: [annotation, unreadableAnnotation] },
    });

    await expect(draftStore.mutate(conversationA, [{ kind: "clear" }])).resolves.toMatchObject({
      annotations: [],
    });
    expect(extensionStorage.snapshot()).toEqual({});
  });

  it("does not overwrite unreadable anchors during migration", async () => {
    const emptyMessageId = {
      ...unmarkedAnnotation,
      id: "empty-message-id",
      anchor: { ...unmarkedAnchor, messageId: "" },
    };
    const emptyQuote = {
      ...unmarkedAnnotation,
      id: "empty-quote",
      anchor: { ...unmarkedAnchor, quote: "" },
    };
    const storedEnvelope = {
      version: 2,
      annotations: [emptyMessageId, unmarkedAnnotation, emptyQuote],
    };
    extensionStorage.reset({ [currentKey]: storedEnvelope });

    await expect(draftStore.load(conversationA)).resolves.toMatchObject({
      annotations: [legacyAnnotation],
    });
    expect(extensionStorage.snapshot()).toEqual({ [currentKey]: storedEnvelope });
  });

  it("keeps a partially unreadable legacy draft at its original key", async () => {
    const storedDraft = [{ id: 42, anchor: null }, unmarkedAnnotation];
    extensionStorage.reset({ [legacyKey]: storedDraft });

    await expect(draftStore.load(conversationA)).resolves.toMatchObject({
      annotations: [legacyAnnotation],
    });
    expect(extensionStorage.snapshot()).toEqual({ [legacyKey]: storedDraft });
  });

  it("writes a versioned envelope and clears current and legacy keys together", async () => {
    extensionStorage.reset({});

    await draftStore.mutate(conversationA, [{ kind: "add", annotation }]);
    expect(extensionStorage.snapshot()).toEqual({ [currentKey]: envelope });

    await draftStore.mutate(conversationA, [{ kind: "clear" }]);
    expect(extensionStorage.snapshot()).toEqual({});
  });

  it("applies a mutation on top of a migrated legacy draft", async () => {
    extensionStorage.reset({ [legacyKey]: [unmarkedAnnotation] });

    await expect(
      draftStore.mutate(conversationA, [
        {
          kind: "update",
          annotationId: legacyAnnotation.id,
          comment: "edited after migration",
        },
      ]),
    ).resolves.toMatchObject({
      annotations: [{ ...legacyAnnotation, comment: "edited after migration" }],
    });
    expect(extensionStorage.keys()).toEqual([currentKey]);
  });

  it("ignores a duplicate add so a retried message cannot double the annotation", async () => {
    extensionStorage.reset({ [currentKey]: envelope });

    await expect(
      draftStore.mutate(conversationA, [{ kind: "add", annotation }]),
    ).resolves.toMatchObject({ annotations: [annotation] });
    expect(extensionStorage.snapshot()).toEqual({ [currentKey]: envelope });
  });

  it("ignores a duplicate add when the authoritative draft is at capacity", async () => {
    const annotations = [
      annotation,
      ...Array.from({ length: MAX_DRAFT_ANNOTATIONS - 1 }, (_, index) => ({
        ...annotation,
        id: `annotation-${index}`,
      })),
    ];
    extensionStorage.reset({ [currentKey]: { ...envelope, annotations } });

    await expect(
      draftStore.mutate(conversationA, [{ kind: "add", annotation }]),
    ).resolves.toMatchObject({ annotations: annotations });
  });

  it("applies an ordered mutation batch against one authoritative draft", async () => {
    extensionStorage.reset({ [currentKey]: envelope });
    const second = { ...annotation, id: "annotation-b", comment: "draft B" };

    await expect(
      draftStore.mutate(conversationA, [
        { kind: "update", annotationId: annotation.id, comment: "updated" },
        { kind: "add", annotation: second },
      ]),
    ).resolves.toMatchObject({ annotations: [{ ...annotation, comment: "updated" }, second] });
    expect(extensionStorage.snapshot()[currentKey]).toMatchObject({
      annotations: [{ ...annotation, comment: "updated" }, second],
    });
  });

  it("orders concurrent adds from separate clients without losing either", async () => {
    extensionStorage.reset({});
    const owner = createDraftOwner();
    const second: DraftAnnotation = { ...annotation, id: "annotation-b", comment: "from B" };

    const [first, latest] = await Promise.all([
      owner.mutate(conversationA, [{ kind: "add", annotation }]),
      owner.mutate(conversationA, [{ kind: "add", annotation: second }]),
    ]);

    expect(first).toMatchObject({ annotations: [annotation] });
    expect(latest).toMatchObject({ annotations: [annotation, second] });
  });

  it("orders concurrent updates so the last one wins and neither is dropped", async () => {
    extensionStorage.reset({ [currentKey]: envelope });
    const owner = createDraftOwner();

    const [, latest] = await Promise.all([
      owner.mutate(conversationA, [{ kind: "update", annotationId: annotation.id, comment: "A" }]),
      owner.mutate(conversationA, [{ kind: "update", annotationId: annotation.id, comment: "B" }]),
    ]);

    expect(latest).toMatchObject({ annotations: [{ ...annotation, comment: "B" }] });
    expect(await owner.load(conversationA)).toMatchObject({
      annotations: [{ ...annotation, comment: "B" }],
    });
  });

  it("applies a concurrent update and discard in issue order", async () => {
    extensionStorage.reset({ [currentKey]: envelope });
    const owner = createDraftOwner();

    const [updated, discarded] = await Promise.all([
      owner.mutate(conversationA, [{ kind: "update", annotationId: annotation.id, comment: "A" }]),
      owner.mutate(conversationA, [{ kind: "discard", annotationIds: [annotation.id] }]),
    ]);

    expect(updated).toMatchObject({ annotations: [{ ...annotation, comment: "A" }] });
    expect(discarded).toMatchObject({ annotations: [] });
    expect(extensionStorage.snapshot()).toEqual({});
  });

  it("keeps an annotation edited concurrently with its send confirmation", async () => {
    extensionStorage.reset({ [currentKey]: envelope });
    const owner = createDraftOwner();

    const [, remaining] = await Promise.all([
      owner.mutate(conversationA, [
        {
          kind: "update",
          annotationId: annotation.id,
          comment: "edited after the send was compiled",
        },
      ]),
      owner.mutate(conversationA, [{ kind: "discard-confirmed", annotations: [annotation] }]),
    ]);

    expect(remaining).toMatchObject({
      annotations: [{ ...annotation, comment: "edited after the send was compiled" }],
    });
  });

  it("never sweeps a draft using expiry read before a queued refresh", async () => {
    const staleConversation = { kind: "identified", id: "stale", siteId: "chatgpt" } as const;
    const staleKey = "quotecue:draft:chatgpt:stale";
    extensionStorage.reset({
      [currentKey]: envelope,
      [staleKey]: { ...envelope, updatedAt: NOW - 31 * DAY_MS },
    });
    let resolveKeys: (keys: string[]) => void = () => undefined;
    extensionStorage.getKeys.mockImplementationOnce(
      () => new Promise<string[]>((resolve) => (resolveKeys = resolve)),
    );
    const owner = createDraftOwner();

    await owner.load(conversationA);
    const refreshed = owner.mutate(staleConversation, [{ kind: "add", annotation }]);
    await vi.waitFor(() => expect(extensionStorage.getKeys).toHaveBeenCalled());
    resolveKeys(extensionStorage.keys());
    await refreshed;

    expect(extensionStorage.keys()).toContain(staleKey);
    expect(await owner.load(staleConversation)).toMatchObject({ annotations: [annotation] });
  });

  it("rechecks expiry after the background scan captured a stale envelope", async () => {
    const staleConversation = { ...conversationA, id: "stale" };
    const staleKey = "quotecue:draft:chatgpt:stale";
    extensionStorage.reset({
      [currentKey]: envelope,
      [staleKey]: { ...envelope, updatedAt: NOW - 31 * DAY_MS },
    });
    const scannedDrafts = extensionStorage.snapshot();
    let resolveScan: (value: Record<string, unknown>) => void = () => undefined;
    const scan = new Promise<Record<string, unknown>>((resolve) => (resolveScan = resolve));
    extensionStorage.get
      .mockImplementationOnce(extensionStorage.get.getMockImplementation()!)
      .mockReturnValueOnce(scan);
    const owner = createDraftOwner();

    await owner.load(conversationA);
    await vi.waitFor(() =>
      expect(extensionStorage.get).toHaveBeenCalledWith([currentKey, staleKey]),
    );
    await owner.mutate(staleConversation, [{ kind: "add", annotation }]);
    resolveScan(scannedDrafts);
    await vi.waitFor(() => expect(extensionStorage.get).toHaveBeenCalledWith([staleKey]));

    expect(await owner.load(staleConversation)).toMatchObject({ annotations: [annotation] });
    expect(extensionStorage.snapshot()).toHaveProperty(staleKey, envelope);
  });
});
