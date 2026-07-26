import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DraftAnnotation } from "@/features/annotations/annotation";
import { loadDraftAnnotations, saveDraftAnnotations } from "@/features/annotations/draft-storage";

const extensionStorage = vi.hoisted(() => {
  let values: Record<string, unknown> = {};

  return {
    get: vi.fn(async (keys: string[]) =>
      Object.fromEntries(keys.filter((key) => key in values).map((key) => [key, values[key]])),
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
const annotation: DraftAnnotation = {
  id: "annotation-a",
  anchor: {
    messageId: "message-a",
    quote: "selected text",
    prefix: "before",
    suffix: "after",
    start: 4,
    end: 17,
  },
  comment: "draft A",
};
const envelope = { version: 2, annotations: [annotation] };

beforeEach(() => extensionStorage.reset());

describe("draft storage", () => {
  it("loads the current versioned envelope", async () => {
    extensionStorage.reset({ [currentKey]: envelope });

    await expect(loadDraftAnnotations("A")).resolves.toEqual([annotation]);
    expect(extensionStorage.snapshot()).toEqual({ [currentKey]: envelope });
  });

  it("migrates version 1 envelopes without losing annotations", async () => {
    extensionStorage.reset({
      [currentKey]: { version: 1, annotations: [annotation] },
    });

    await expect(loadDraftAnnotations("A")).resolves.toEqual([annotation]);
    expect(extensionStorage.snapshot()).toEqual({ [currentKey]: envelope });
  });

  it("preserves the rendered quote in version 2 drafts", async () => {
    const tableAnnotation = {
      ...annotation,
      anchor: {
        ...annotation.anchor,
        displayQuote: "alpha beta",
        quote: "alphabeta",
      },
    };
    const tableEnvelope = { version: 2, annotations: [tableAnnotation] };
    extensionStorage.reset({ [currentKey]: tableEnvelope });

    await expect(loadDraftAnnotations("A")).resolves.toEqual([tableAnnotation]);
    expect(extensionStorage.snapshot()).toEqual({ [currentKey]: tableEnvelope });
  });

  it("migrates raw arrays while preserving valid items and removing obsolete fields", async () => {
    extensionStorage.reset({
      [currentKey]: [
        { ...annotation, createdAt: 1 },
        { id: 42, anchor: null },
        { ...annotation, createdAt: 2 },
      ],
    });

    await expect(loadDraftAnnotations("A")).resolves.toEqual([annotation]);
    expect(extensionStorage.snapshot()).toEqual({ [currentKey]: envelope });
  });

  it("writes the new envelope before removing a legacy key", async () => {
    extensionStorage.reset({ [legacyKey]: [{ ...annotation, createdAt: 1 }] });

    await expect(loadDraftAnnotations("A")).resolves.toEqual([annotation]);
    expect(extensionStorage.snapshot()).toEqual({ [currentKey]: envelope });
  });

  it("keeps legacy data when the migration write fails", async () => {
    const legacyDraft = [{ ...annotation, createdAt: 1 }];
    extensionStorage.reset({ [legacyKey]: legacyDraft });
    extensionStorage.set.mockRejectedValueOnce(new Error("write failed"));

    await expect(loadDraftAnnotations("A")).rejects.toThrow("write failed");
    expect(extensionStorage.snapshot()).toEqual({ [legacyKey]: legacyDraft });
  });

  it("retries legacy cleanup without blocking a successfully migrated draft", async () => {
    const legacyDraft = [{ ...annotation, createdAt: 1 }];
    extensionStorage.reset({ [legacyKey]: legacyDraft });
    extensionStorage.remove.mockRejectedValueOnce(new Error("remove failed"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(loadDraftAnnotations("A")).resolves.toEqual([annotation]);
    expect(extensionStorage.snapshot()).toEqual({
      [currentKey]: envelope,
      [legacyKey]: legacyDraft,
    });
    await expect(loadDraftAnnotations("A")).resolves.toEqual([annotation]);
    expect(extensionStorage.snapshot()).toEqual({ [currentKey]: envelope });

    consoleError.mockRestore();
  });

  it("preserves unknown versions and wholly invalid drafts", async () => {
    const unknownVersion = { version: 3, annotations: [annotation] };
    extensionStorage.reset({ [currentKey]: unknownVersion });

    await expect(loadDraftAnnotations("A")).rejects.toThrow("Unsupported draft storage version");
    expect(extensionStorage.snapshot()).toEqual({ [currentKey]: unknownVersion });

    const malformedDraft = [{ id: 42, anchor: null }];
    extensionStorage.reset({ [currentKey]: malformedDraft });
    await expect(loadDraftAnnotations("A")).rejects.toThrow("Draft contains no valid annotations");
    expect(extensionStorage.snapshot()).toEqual({ [currentKey]: malformedDraft });

    const malformedDisplayQuote = {
      version: 2,
      annotations: [{ ...annotation, anchor: { ...annotation.anchor, displayQuote: 42 } }],
    };
    extensionStorage.reset({ [currentKey]: malformedDisplayQuote });
    await expect(loadDraftAnnotations("A")).rejects.toThrow("Draft contains no valid annotations");
    expect(extensionStorage.snapshot()).toEqual({ [currentKey]: malformedDisplayQuote });
  });

  it("filters anchors with empty required fields during migration", async () => {
    const emptyMessageId = {
      ...annotation,
      id: "empty-message-id",
      anchor: { ...annotation.anchor, messageId: "" },
    };
    const emptyQuote = {
      ...annotation,
      id: "empty-quote",
      anchor: { ...annotation.anchor, quote: "" },
    };
    extensionStorage.reset({
      [currentKey]: { version: 2, annotations: [emptyMessageId, annotation, emptyQuote] },
    });

    await expect(loadDraftAnnotations("A")).resolves.toEqual([annotation]);
    expect(extensionStorage.snapshot()).toEqual({ [currentKey]: envelope });
  });

  it("saves versioned drafts and clears current and legacy keys together", async () => {
    extensionStorage.reset({ [legacyKey]: [annotation] });

    await saveDraftAnnotations("A", [annotation]);
    expect(extensionStorage.snapshot()).toEqual({ [currentKey]: envelope });

    await saveDraftAnnotations("A", []);
    expect(extensionStorage.snapshot()).toEqual({});
  });
});
