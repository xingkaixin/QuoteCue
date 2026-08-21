import type { IdentifiedConversation } from "@/features/host-port/host-port";
import { parseTextAnchor } from "@/features/host-port/text-anchor";
import { isRecord } from "@/lib/is-record";
import { isSupportedSiteId } from "@/lib/supported-sites";

import type { DraftAnnotation } from "./annotation";
import type { DraftMutation } from "./draft-mutation";

export const DRAFT_OWNER_MESSAGE = "quotecue:draft";

export type DraftOwnerRequest =
  | { channel: typeof DRAFT_OWNER_MESSAGE; kind: "load"; conversation: IdentifiedConversation }
  | {
      channel: typeof DRAFT_OWNER_MESSAGE;
      kind: "mutate";
      conversation: IdentifiedConversation;
      mutation: DraftMutation;
    };

export type DraftOwnerResponse =
  | { status: "ok"; annotations: DraftAnnotation[] }
  | { status: "error"; message: string };

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
  return value.kind === "mutate" && isDraftMutation(value.mutation);
}

export function isDraftOwnerResponse(value: unknown): value is DraftOwnerResponse {
  if (!isRecord(value)) {
    return false;
  }
  if (value.status === "error") {
    return typeof value.message === "string";
  }
  return (
    value.status === "ok" &&
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
