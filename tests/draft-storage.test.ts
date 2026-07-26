import { beforeEach, describe, expect, it, vi } from "vitest";

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
    set: vi.fn(async (updates: Record<string, unknown>) => Object.assign(values, updates)),
    remove: vi.fn(async (keys: string | string[]) => {
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        delete values[key];
      }
    }),
    reset(nextValues: Record<string, unknown> = {}) {
      values = structuredClone(nextValues);
      this.get.mockClear();
      this.set.mockClear();
      this.remove.mockClear();
    },
    snapshot() {
      return structuredClone(values);
    },
  };
});

vi.mock("wxt/browser", () => ({
  browser: { storage: { local: extensionStorage } },
}));

const currentKey = "quotecue:draft:A";
const legacyKey = "askgpt:draft:A";
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
const envelope = { version: 3, annotations: [annotation] };
const legacyEnvelope = { version: 3, annotations: [legacyAnnotation] };

beforeEach(() => extensionStorage.reset());

describe("draft storage", () => {
  it("removes orphaned temporary drafts without touching other storage", async () => {
    extensionStorage.reset({
      [currentKey]: envelope,
      "quotecue:draft:new-chat:current-orphan": envelope,
      "askgpt:draft:new-chat:legacy-orphan": [annotation],
      "unrelated-key": "preserved",
    });

    await expect(loadDraftAnnotations(conversationA)).resolves.toEqual([annotation]);
    expect(extensionStorage.snapshot()).toEqual({
      [currentKey]: envelope,
      "unrelated-key": "preserved",
    });
  });

  it("loads the current versioned envelope", async () => {
    extensionStorage.reset({ [currentKey]: envelope });

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
    const migratedEnvelope = { version: 3, annotations: [migratedAnnotation] };
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
    const tableEnvelope = { version: 3, annotations: [tableAnnotation] };
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
        { id: 42, anchor: null },
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

  it("filters anchors with empty required fields during migration", async () => {
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
    extensionStorage.reset({
      [currentKey]: {
        version: 2,
        annotations: [emptyMessageId, unmarkedAnnotation, emptyQuote],
      },
    });

    await expect(loadDraftAnnotations(conversationA)).resolves.toEqual([legacyAnnotation]);
    expect(extensionStorage.snapshot()).toEqual({ [currentKey]: legacyEnvelope });
  });

  it("saves versioned drafts and clears current and legacy keys together", async () => {
    extensionStorage.reset({ [legacyKey]: [annotation] });

    await saveDraftAnnotations(conversationA, [annotation]);
    expect(extensionStorage.snapshot()).toEqual({ [currentKey]: envelope });

    await saveDraftAnnotations(conversationA, []);
    expect(extensionStorage.snapshot()).toEqual({});
  });
});
