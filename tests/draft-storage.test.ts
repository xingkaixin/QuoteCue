import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DraftAnnotation } from "@/features/annotations/annotation";
import { loadDraftAnnotations, saveDraftAnnotations } from "@/features/annotations/draft-storage";

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

const currentKey = "quotecue:draft:A";
const legacyKey = "askgpt:draft:A";
const NOW = Date.UTC(2026, 6, 27);
const DAY_MS = 24 * 60 * 60 * 1_000;
const conversationA = { kind: "identified", id: "A" } as const;
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

beforeEach(() => {
  extensionStorage.reset();
  vi.spyOn(Date, "now").mockReturnValue(NOW);
});

afterEach(() => vi.restoreAllMocks());

describe("draft storage", () => {
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

    await expect(loadDraftAnnotations(conversationA)).resolves.toEqual([annotation]);
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

    await expect(loadDraftAnnotations(conversationA)).resolves.toEqual([annotation]);
    expect(extensionStorage.snapshot()).toEqual({ [currentKey]: envelope });
  });

  it("deduplicates repeated annotation ids in the current envelope", async () => {
    extensionStorage.reset({
      [currentKey]: { version: 3, annotations: [annotation, annotation] },
    });

    await expect(loadDraftAnnotations(conversationA)).resolves.toEqual([annotation]);
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

    await expect(loadDraftAnnotations(conversationA)).resolves.toEqual([migratedAnnotation]);
    expect(extensionStorage.snapshot()).toEqual({ [currentKey]: migratedEnvelope });

    extensionStorage.set.mockClear();
    await expect(loadDraftAnnotations(conversationA)).resolves.toEqual([migratedAnnotation]);
    expect(extensionStorage.set).not.toHaveBeenCalled();
  });

  it("marks unidentifiable version 2 anchors as legacy-rendered", async () => {
    extensionStorage.reset({
      [currentKey]: { version: 2, annotations: [unmarkedAnnotation] },
    });

    await expect(loadDraftAnnotations(conversationA)).resolves.toEqual([legacyAnnotation]);
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

    await expect(loadDraftAnnotations(conversationA)).resolves.toEqual([tableAnnotation]);
    expect(extensionStorage.snapshot()).toEqual({ [currentKey]: tableEnvelope });
  });

  it("migrates raw arrays while preserving valid items and removing obsolete fields", async () => {
    extensionStorage.reset({
      [currentKey]: [
        { ...unmarkedAnnotation, createdAt: 1 },
        { ...unmarkedAnnotation, createdAt: 2 },
      ],
    });

    await expect(loadDraftAnnotations(conversationA)).resolves.toEqual([legacyAnnotation]);
    expect(extensionStorage.snapshot()).toEqual({ [currentKey]: legacyEnvelope });
  });

  it("writes the new envelope before removing a legacy key", async () => {
    extensionStorage.reset({ [legacyKey]: [{ ...unmarkedAnnotation, createdAt: 1 }] });

    await expect(loadDraftAnnotations(conversationA)).resolves.toEqual([legacyAnnotation]);
    expect(extensionStorage.snapshot()).toEqual({ [currentKey]: legacyEnvelope });
  });

  it("keeps legacy data when the migration write fails", async () => {
    const legacyDraft = [{ ...unmarkedAnnotation, createdAt: 1 }];
    extensionStorage.reset({ [legacyKey]: legacyDraft });
    extensionStorage.set.mockRejectedValueOnce(new Error("write failed"));

    await expect(loadDraftAnnotations(conversationA)).rejects.toThrow("write failed");
    expect(extensionStorage.snapshot()).toEqual({ [legacyKey]: legacyDraft });
  });

  it("retries legacy cleanup without blocking a successfully migrated draft", async () => {
    const legacyDraft = [{ ...unmarkedAnnotation, createdAt: 1 }];
    extensionStorage.reset({ [legacyKey]: legacyDraft });
    extensionStorage.remove.mockRejectedValueOnce(new Error("remove failed"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(loadDraftAnnotations(conversationA)).resolves.toEqual([legacyAnnotation]);
    expect(extensionStorage.snapshot()).toEqual({
      [currentKey]: legacyEnvelope,
      [legacyKey]: legacyDraft,
    });
    await expect(loadDraftAnnotations(conversationA)).resolves.toEqual([legacyAnnotation]);
    expect(extensionStorage.snapshot()).toEqual({ [currentKey]: legacyEnvelope });

    consoleError.mockRestore();
  });

  it("preserves unknown versions and wholly invalid drafts", async () => {
    const unknownVersion = { version: 4, annotations: [annotation] };
    extensionStorage.reset({ [currentKey]: unknownVersion });

    await expect(loadDraftAnnotations(conversationA)).rejects.toThrow(
      "Unsupported draft storage version",
    );
    expect(extensionStorage.snapshot()).toEqual({ [currentKey]: unknownVersion });

    const malformedDraft = [{ id: 42, anchor: null }];
    extensionStorage.reset({ [currentKey]: malformedDraft });
    await expect(loadDraftAnnotations(conversationA)).rejects.toThrow(
      "Draft contains no valid annotations",
    );
    expect(extensionStorage.snapshot()).toEqual({ [currentKey]: malformedDraft });

    const malformedDisplayQuote = {
      version: 2,
      annotations: [{ ...unmarkedAnnotation, anchor: { ...unmarkedAnchor, displayQuote: 42 } }],
    };
    extensionStorage.reset({ [currentKey]: malformedDisplayQuote });
    await expect(loadDraftAnnotations(conversationA)).rejects.toThrow(
      "Draft contains no valid annotations",
    );
    expect(extensionStorage.snapshot()).toEqual({ [currentKey]: malformedDisplayQuote });

    const missingFormat = {
      version: 3,
      annotations: [unmarkedAnnotation],
    };
    extensionStorage.reset({ [currentKey]: missingFormat });
    await expect(loadDraftAnnotations(conversationA)).rejects.toThrow(
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

    await expect(loadDraftAnnotations(conversationA)).resolves.toEqual([annotation]);
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

    await expect(loadDraftAnnotations(conversationA)).resolves.toEqual([legacyAnnotation]);
    expect(extensionStorage.snapshot()).toEqual({ [currentKey]: storedEnvelope });
  });

  it("keeps a partially unreadable legacy draft at its original key", async () => {
    const storedDraft = [{ id: 42, anchor: null }, unmarkedAnnotation];
    extensionStorage.reset({ [legacyKey]: storedDraft });

    await expect(loadDraftAnnotations(conversationA)).resolves.toEqual([legacyAnnotation]);
    expect(extensionStorage.snapshot()).toEqual({ [legacyKey]: storedDraft });
  });

  it("saves versioned drafts and clears current and legacy keys together", async () => {
    extensionStorage.reset({ [legacyKey]: [annotation] });

    await saveDraftAnnotations(conversationA, [annotation]);
    expect(extensionStorage.snapshot()).toEqual({ [currentKey]: envelope });

    await saveDraftAnnotations(conversationA, []);
    expect(extensionStorage.snapshot()).toEqual({});
  });
});
