import { isRecord } from "@/lib/is-record";
import { isSupportedSiteId } from "@quotecue/shared/supported-sites";
import { parseTextAnchor } from "@/lib/text-anchor";
import type { IdentifiedConversation } from "@/features/conversation/conversation-identity";

import type { DraftAnnotation } from "./annotation";
import type { DraftMutation } from "./draft-mutation";
import type { DraftMutationResult, DraftSnapshot } from "./draft-store";

export const DRAFT_OWNER_MESSAGE = "quotecue:draft";

export type DraftOwnerRequest =
  | { channel: typeof DRAFT_OWNER_MESSAGE; kind: "load"; conversation: IdentifiedConversation }
  | {
      channel: typeof DRAFT_OWNER_MESSAGE;
      kind: "mutate";
      conversation: IdentifiedConversation;
      mutations: readonly DraftMutation[];
    };

export type DraftOwnerResponse =
  | { kind: "loaded"; draft: DraftSnapshot }
  | { kind: "mutated"; result: DraftMutationResult }
  | { kind: "error"; message: string };

export function isDraftOwnerRequest(value: unknown): value is DraftOwnerRequest {
  if (
    !isRecord(value) ||
    value.channel !== DRAFT_OWNER_MESSAGE ||
    !isIdentifiedConversation(value.conversation)
  ) {
    return false;
  }
  if (value.kind === "load") {
    return true;
  }
  return (
    value.kind === "mutate" &&
    Array.isArray(value.mutations) &&
    value.mutations.length > 0 &&
    value.mutations.every(isDraftMutation)
  );
}

export function isDraftOwnerResponse(value: unknown): value is DraftOwnerResponse {
  if (!isRecord(value)) {
    return false;
  }
  switch (value.kind) {
    case "loaded":
      return isDraftSnapshot(value.draft);
    case "mutated":
      return isDraftMutationResult(value.result);
    case "error":
      return typeof value.message === "string";
    default:
      return false;
  }
}

function isDraftMutationResult(value: unknown): value is DraftMutationResult {
  if (!isRecord(value)) {
    return false;
  }
  return (
    (value.status === "ok" ||
      (value.status === "rejected" &&
        (value.reason === "capacity" || value.reason === "unreadable"))) &&
    isDraftSnapshot(value)
  );
}

function isDraftSnapshot(value: unknown): value is DraftSnapshot {
  return (
    isRecord(value) &&
    typeof value.hasUnreadableAnnotations === "boolean" &&
    Array.isArray(value.annotations) &&
    value.annotations.every(isDraftAnnotation)
  );
}

function isIdentifiedConversation(value: unknown): value is IdentifiedConversation {
  return (
    isRecord(value) &&
    value.kind === "identified" &&
    typeof value.id === "string" &&
    isSupportedSiteId(value.siteId)
  );
}

function isDraftMutation(value: unknown): value is DraftMutation {
  if (!isRecord(value)) {
    return false;
  }
  switch (value.kind) {
    case "add":
      return isDraftAnnotation(value.annotation);
    case "update":
      return typeof value.annotationId === "string" && typeof value.comment === "string";
    case "discard":
      return isStringArray(value.annotationIds);
    case "discard-confirmed":
      return Array.isArray(value.annotations) && value.annotations.every(isDraftAnnotation);
    case "clear":
      return true;
    default:
      return false;
  }
}

function isDraftAnnotation(value: unknown): value is DraftAnnotation {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.comment === "string" &&
    parseTextAnchor(value.anchor) !== null
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}
