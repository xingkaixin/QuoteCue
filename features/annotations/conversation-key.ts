const CONVERSATION_PATH_PATTERN = /^\/c\/([^/?#]+)/;

export function createTemporaryConversationKey() {
  return `new-chat:${crypto.randomUUID()}`;
}

export function conversationKeyFromPathname(pathname: string, temporaryConversationKey: string) {
  return pathname.match(CONVERSATION_PATH_PATTERN)?.[1] ?? temporaryConversationKey;
}
