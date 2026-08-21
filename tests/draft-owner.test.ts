import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DraftAnnotation } from "@/features/annotations/annotation";
import { MAX_ANNOTATION_COMMENT_LENGTH } from "@/features/annotations/draft-capacity";
import { createDraftOwner } from "@/features/annotations/draft-owner";

const extensionStorage = vi.hoisted(() => {
  let values: Record<string, unknown> = {};

  return {
    get: vi.fn(async (keys: string[] | null) =>
      keys === null
        ? structuredClone(values)
        : Object.fromEntries(keys.filter((key) => key in values).map((key) => [key, values[key]])),
    ),
    getKeys: vi.fn(async () => Object.keys(values)),
    set: vi.fn(async (updates: Record<string, unknown>) => Object.assign(values, updates)),
    remove: vi.fn(async (keys: string | string[]) => {
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        delete values[key];
      }
    }),
    reset(nextValues: Record<string, unknown> = {}) {
      values = structuredClone(nextValues);
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

vi.mock("wxt/browser", () => ({
  browser: { storage: { local: extensionStorage } },
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
  vi.spyOn(Date, "now").mockReturnValue(NOW);
});

afterEach(() => vi.restoreAllMocks());

describe("draft storage", () => {
  it("rejects oversized mutations before writing storage", async () => {
    await expect(
      draftStore.mutate(conversationA, {
        kind: "add",
        annotation: {
          ...annotation,
          comment: "x".repeat(MAX_ANNOTATION_COMMENT_LENGTH + 1),
        },
      }),
    ).rejects.toThrow("Draft mutation exceeds QuoteCue capacity");

    expect(extensionStorage.set).not.toHaveBeenCalled();
  });

  it("scopes startup cleanup to each store instance", async () => {
    extensionStorage.reset({ [currentKey]: envelope });
    extensionStorage.getKeys.mockClear();

    await createDraftOwner().load(conversationA);
    await vi.waitFor(() => expect(extensionStorage.getKeys).toHaveBeenCalledOnce());

    await createDraftOwner().load(conversationA);
    await vi.waitFor(() => expect(extensionStorage.getKeys).toHaveBeenCalledTimes(2));
  });

  it("loads without waiting for conservative background cleanup", async () => {
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

    await expect(draftStore.load(conversationA)).resolves.toEqual([annotation]);
    expect(extensionStorage.remove).not.toHaveBeenCalled();

    resolveKeys(extensionStorage.keys());
    await vi.waitFor(() => {
      expect(extensionStorage.snapshot()).toEqual({
        [currentKey]: staleEnvelope,
        [recentKey]: { ...envelope, updatedAt: NOW - 29 * DAY_MS },
        [unmarkedKey]: unmarkedEnvelope,
        "unrelated-key": "preserved",
      });
    });
    expect(extensionStorage.getKeys).toHaveBeenCalledOnce();
    expect(extensionStorage.get).not.toHaveBeenCalledWith(null);
    expect(consoleInfo).toHaveBeenCalledWith("[QuoteCue] Removed 1 expired annotation draft");
  });

  it("loads the current versioned envelope", async () => {
    extensionStorage.reset({ [currentKey]: envelope });

    await expect(draftStore.load(conversationA)).resolves.toEqual([annotation]);
    expect(extensionStorage.snapshot()).toEqual({ [currentKey]: envelope });
  });

  it("migrates an unscoped draft into the current site", async () => {
    extensionStorage.reset({ [unscopedKey]: envelope });

    await expect(draftStore.load(conversationA)).resolves.toEqual([annotation]);
    expect(extensionStorage.snapshot()).toEqual({ [currentKey]: envelope });
  });

  it("isolates equal conversation ids from different sites", async () => {
    const claudeConversation = { ...conversationA, siteId: "claude" } as const;
    const claudeKey = "quotecue:draft:claude:A";
    const claudeAnnotation = { ...annotation, id: "annotation-claude", comment: "Claude draft" };

    await draftStore.mutate(conversationA, { kind: "add", annotation });
    await draftStore.mutate(claudeConversation, { kind: "add", annotation: claudeAnnotation });

    expect(await draftStore.load(conversationA)).toEqual([annotation]);
    expect(await draftStore.load(claudeConversation)).toEqual([claudeAnnotation]);
    expect(extensionStorage.snapshot()).toEqual({
      [currentKey]: envelope,
      [claudeKey]: { ...envelope, annotations: [claudeAnnotation] },
    });
  });

  it("deduplicates repeated annotation ids in the current envelope", async () => {
    extensionStorage.reset({
      [currentKey]: { version: 3, annotations: [annotation, annotation] },
    });

    await expect(draftStore.load(conversationA)).resolves.toEqual([annotation]);
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

    await expect(draftStore.load(conversationA)).resolves.toEqual([migratedAnnotation]);
    expect(extensionStorage.snapshot()).toEqual({ [currentKey]: migratedEnvelope });

    extensionStorage.set.mockClear();
    await expect(draftStore.load(conversationA)).resolves.toEqual([migratedAnnotation]);
    expect(extensionStorage.set).not.toHaveBeenCalled();
  });

  it("marks unidentifiable version 2 anchors as legacy-rendered", async () => {
    extensionStorage.reset({
      [currentKey]: { version: 2, annotations: [unmarkedAnnotation] },
    });

    await expect(draftStore.load(conversationA)).resolves.toEqual([legacyAnnotation]);
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

    await expect(draftStore.load(conversationA)).resolves.toEqual([tableAnnotation]);
    expect(extensionStorage.snapshot()).toEqual({ [currentKey]: tableEnvelope });
  });

  it("migrates raw arrays while preserving valid items and removing obsolete fields", async () => {
    extensionStorage.reset({
      [currentKey]: [
        { ...unmarkedAnnotation, createdAt: 1 },
        { ...unmarkedAnnotation, createdAt: 2 },
      ],
    });

    await expect(draftStore.load(conversationA)).resolves.toEqual([legacyAnnotation]);
    expect(extensionStorage.snapshot()).toEqual({ [currentKey]: legacyEnvelope });
  });

  it("writes the new envelope before removing a legacy key", async () => {
    extensionStorage.reset({ [legacyKey]: [{ ...unmarkedAnnotation, createdAt: 1 }] });

    await expect(draftStore.load(conversationA)).resolves.toEqual([legacyAnnotation]);
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

    await expect(draftStore.load(conversationA)).resolves.toEqual([legacyAnnotation]);
    expect(extensionStorage.snapshot()).toEqual({
      [currentKey]: legacyEnvelope,
      [legacyKey]: legacyDraft,
    });
    await expect(draftStore.load(conversationA)).resolves.toEqual([legacyAnnotation]);
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
    await expect(draftStore.load(conversationA)).rejects.toThrow(
      "Draft contains no valid annotations",
    );
    expect(extensionStorage.snapshot()).toEqual({ [currentKey]: malformedDraft });

    const malformedDisplayQuote = {
      version: 2,
      annotations: [{ ...unmarkedAnnotation, anchor: { ...unmarkedAnchor, displayQuote: 42 } }],
    };
    extensionStorage.reset({ [currentKey]: malformedDisplayQuote });
    await expect(draftStore.load(conversationA)).rejects.toThrow(
      "Draft contains no valid annotations",
    );
    expect(extensionStorage.snapshot()).toEqual({ [currentKey]: malformedDisplayQuote });

    const missingFormat = {
      version: 3,
      annotations: [unmarkedAnnotation],
    };
    extensionStorage.reset({ [currentKey]: missingFormat });
    await expect(draftStore.load(conversationA)).rejects.toThrow(
      "Draft contains no valid annotations",
    );
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

    await expect(draftStore.load(conversationA)).resolves.toEqual([annotation]);
    expect(extensionStorage.snapshot()).toEqual({ [currentKey]: storedEnvelope });
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

    await expect(draftStore.load(conversationA)).resolves.toEqual([legacyAnnotation]);
    expect(extensionStorage.snapshot()).toEqual({ [currentKey]: storedEnvelope });
  });

  it("keeps a partially unreadable legacy draft at its original key", async () => {
    const storedDraft = [{ id: 42, anchor: null }, unmarkedAnnotation];
    extensionStorage.reset({ [legacyKey]: storedDraft });

    await expect(draftStore.load(conversationA)).resolves.toEqual([legacyAnnotation]);
    expect(extensionStorage.snapshot()).toEqual({ [legacyKey]: storedDraft });
  });

  it("writes a versioned envelope and clears current and legacy keys together", async () => {
    extensionStorage.reset({});

    await draftStore.mutate(conversationA, { kind: "add", annotation });
    expect(extensionStorage.snapshot()).toEqual({ [currentKey]: envelope });

    await draftStore.mutate(conversationA, { kind: "clear" });
    expect(extensionStorage.snapshot()).toEqual({});
  });

  it("applies a mutation on top of a migrated legacy draft", async () => {
    extensionStorage.reset({ [legacyKey]: [unmarkedAnnotation] });

    await expect(
      draftStore.mutate(conversationA, {
        kind: "update",
        annotationId: legacyAnnotation.id,
        comment: "edited after migration",
      }),
    ).resolves.toEqual([{ ...legacyAnnotation, comment: "edited after migration" }]);
    expect(extensionStorage.keys()).toEqual([currentKey]);
  });

  it("ignores a duplicate add so a retried message cannot double the annotation", async () => {
    extensionStorage.reset({ [currentKey]: envelope });

    await expect(draftStore.mutate(conversationA, { kind: "add", annotation })).resolves.toEqual([
      annotation,
    ]);
    expect(extensionStorage.snapshot()).toEqual({ [currentKey]: envelope });
  });

  it("orders concurrent adds from separate clients without losing either", async () => {
    extensionStorage.reset({});
    const owner = createDraftOwner();
    const second: DraftAnnotation = { ...annotation, id: "annotation-b", comment: "from B" };

    const [first, latest] = await Promise.all([
      owner.mutate(conversationA, { kind: "add", annotation }),
      owner.mutate(conversationA, { kind: "add", annotation: second }),
    ]);

    expect(first).toEqual([annotation]);
    expect(latest).toEqual([annotation, second]);
  });

  it("orders concurrent updates so the last one wins and neither is dropped", async () => {
    extensionStorage.reset({ [currentKey]: envelope });
    const owner = createDraftOwner();

    const [, latest] = await Promise.all([
      owner.mutate(conversationA, { kind: "update", annotationId: annotation.id, comment: "A" }),
      owner.mutate(conversationA, { kind: "update", annotationId: annotation.id, comment: "B" }),
    ]);

    expect(latest).toEqual([{ ...annotation, comment: "B" }]);
    expect(await owner.load(conversationA)).toEqual([{ ...annotation, comment: "B" }]);
  });

  it("applies a concurrent update and discard in issue order", async () => {
    extensionStorage.reset({ [currentKey]: envelope });
    const owner = createDraftOwner();

    const [updated, discarded] = await Promise.all([
      owner.mutate(conversationA, { kind: "update", annotationId: annotation.id, comment: "A" }),
      owner.mutate(conversationA, { kind: "discard", annotationIds: [annotation.id] }),
    ]);

    expect(updated).toEqual([{ ...annotation, comment: "A" }]);
    expect(discarded).toEqual([]);
    expect(extensionStorage.snapshot()).toEqual({});
  });

  it("keeps an annotation edited concurrently with its send confirmation", async () => {
    extensionStorage.reset({ [currentKey]: envelope });
    const owner = createDraftOwner();

    const [, remaining] = await Promise.all([
      owner.mutate(conversationA, {
        kind: "update",
        annotationId: annotation.id,
        comment: "edited after the send was compiled",
      }),
      owner.mutate(conversationA, { kind: "discard-confirmed", annotations: [annotation] }),
    ]);

    expect(remaining).toEqual([{ ...annotation, comment: "edited after the send was compiled" }]);
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
    const refreshed = owner.mutate(staleConversation, { kind: "add", annotation });
    await vi.waitFor(() => expect(extensionStorage.getKeys).toHaveBeenCalled());
    resolveKeys(extensionStorage.keys());
    await refreshed;

    expect(extensionStorage.keys()).toContain(staleKey);
    expect(await owner.load(staleConversation)).toEqual([annotation]);
  });
});
