import type { SupportedSiteId } from "@quotecue/shared/supported-sites";

export type IdentifiedConversation = {
  kind: "identified";
  id: string;
  siteId: SupportedSiteId;
};

export type UnidentifiedConversation = {
  kind: "unidentified";
  sessionKey: string;
};

export type ConversationIdentity = IdentifiedConversation | UnidentifiedConversation;

export function sameConversationIdentity(left: ConversationIdentity, right: ConversationIdentity) {
  if (left.kind === "identified" && right.kind === "identified") {
    return left.siteId === right.siteId && left.id === right.id;
  }
  if (left.kind === "unidentified" && right.kind === "unidentified") {
    return left.sessionKey === right.sessionKey;
  }
  return false;
}

export function conversationIdentityKey(identity: ConversationIdentity) {
  return identity.kind === "identified"
    ? `identified:${identity.siteId}:${identity.id}`
    : `unidentified:${identity.sessionKey}`;
}
