import { isRecord } from "@/lib/is-record";
import { parseTextAnchor } from "@/lib/text-anchor";

import type { DraftAnnotation } from "./annotation";

const RENDERED_QUOTE_DRAFT_STORAGE_VERSION = 1;
const UNMARKED_ANCHOR_DRAFT_STORAGE_VERSION = 2;
const DRAFT_STORAGE_VERSION = 3;

type DraftStorageVersion =
  | typeof RENDERED_QUOTE_DRAFT_STORAGE_VERSION
  | typeof UNMARKED_ANCHOR_DRAFT_STORAGE_VERSION
  | typeof DRAFT_STORAGE_VERSION;

type StoredDraftEnvelope = {
  version: typeof DRAFT_STORAGE_VERSION;
  annotations: DraftAnnotation[];
  updatedAt?: number;
};

export type DecodedDraft = {
  annotations: DraftAnnotation[];
  hasUnreadableAnnotations: boolean;
  needsMigration: boolean;
};

type DecodedAnnotations = {
  annotations: DraftAnnotation[];
  hasDuplicateAnnotations: boolean;
  hasUnreadableAnnotations: boolean;
};

export function emptyDecodedDraft(): DecodedDraft {
  return { annotations: [], hasUnreadableAnnotations: false, needsMigration: false };
}

export function draftEnvelope(annotations: DraftAnnotation[]): StoredDraftEnvelope {
  return { version: DRAFT_STORAGE_VERSION, annotations, updatedAt: Date.now() };
}

export function decodeStoredDraft(value: unknown): DecodedDraft {
  if (Array.isArray(value)) {
    const decoded = decodeAnnotations(value, RENDERED_QUOTE_DRAFT_STORAGE_VERSION);
    return {
      annotations: decoded.annotations,
      hasUnreadableAnnotations: decoded.hasUnreadableAnnotations,
      needsMigration: true,
    };
  }
  if (!isRecord(value) || !isDraftStorageVersion(value.version)) {
    throw new Error("Unsupported draft storage version");
  }
  if (!Array.isArray(value.annotations)) {
    throw new Error("Draft annotations must be an array");
  }

  const decoded = decodeAnnotations(value.annotations, value.version);
  return {
    annotations: decoded.annotations,
    hasUnreadableAnnotations: decoded.hasUnreadableAnnotations,
    needsMigration: value.version !== DRAFT_STORAGE_VERSION || decoded.hasDuplicateAnnotations,
  };
}

export function isExpiredDraftEnvelope(value: unknown, expiresBefore: number) {
  return (
    isRecord(value) &&
    value.version === DRAFT_STORAGE_VERSION &&
    Array.isArray(value.annotations) &&
    typeof value.updatedAt === "number" &&
    Number.isFinite(value.updatedAt) &&
    value.updatedAt <= expiresBefore
  );
}

function decodeAnnotations(values: unknown[], version: DraftStorageVersion): DecodedAnnotations {
  const annotations: DraftAnnotation[] = [];
  const annotationIds = new Set<string>();
  let hasDuplicateAnnotations = false;
  let hasUnreadableAnnotations = false;

  for (const value of values) {
    const annotation = decodeAnnotation(value, version);
    if (!annotation) {
      hasUnreadableAnnotations = true;
      continue;
    }
    if (annotationIds.has(annotation.id)) {
      hasDuplicateAnnotations = true;
      continue;
    }
    annotationIds.add(annotation.id);
    annotations.push(annotation);
  }

  if (values.length > 0 && annotations.length === 0) {
    throw new Error("Draft contains no valid annotations");
  }
  return { annotations, hasDuplicateAnnotations, hasUnreadableAnnotations };
}

function decodeAnnotation(value: unknown, version: DraftStorageVersion): DraftAnnotation | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.comment !== "string") {
    return null;
  }
  const anchor = decodeTextAnchor(value.anchor, version);
  return anchor ? { id: value.id, anchor, comment: value.comment } : null;
}

function decodeTextAnchor(value: unknown, version: DraftStorageVersion) {
  if (version === DRAFT_STORAGE_VERSION) {
    return parseTextAnchor(value);
  }
  if (!isRecord(value)) {
    return null;
  }

  // Version 2 may contain version 1 data rewritten unchanged; only displayQuote proves exact capture.
  const format =
    version === UNMARKED_ANCHOR_DRAFT_STORAGE_VERSION && value.displayQuote !== undefined
      ? "exact"
      : "legacy-rendered";
  return parseTextAnchor({ ...value, format });
}

function isDraftStorageVersion(value: unknown): value is DraftStorageVersion {
  return (
    value === RENDERED_QUOTE_DRAFT_STORAGE_VERSION ||
    value === UNMARKED_ANCHOR_DRAFT_STORAGE_VERSION ||
    value === DRAFT_STORAGE_VERSION
  );
}
