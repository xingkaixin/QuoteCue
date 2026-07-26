import type { ConversationIdentity } from "@/features/host-port/host-port";

export function sameConversationIdentity(left: ConversationIdentity, right: ConversationIdentity) {
  if (left.kind === "identified" && right.kind === "identified") {
    return left.id === right.id;
  }
  if (left.kind === "unidentified" && right.kind === "unidentified") {
    return left.sessionKey === right.sessionKey;
  }
  return false;
}
