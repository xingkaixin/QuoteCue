import type { IdentifiedConversation } from "@/features/host-port/host-port";
import { isRecord } from "@/lib/is-record";

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
  return isRecord(value) && value.channel === DRAFT_OWNER_MESSAGE;
}
