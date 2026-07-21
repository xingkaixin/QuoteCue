const CONVERSATION_PATH_PATTERN = /^\/c\/([^/?#]+)/;

export function currentConversationKey(pathname = window.location.pathname) {
  return pathname.match(CONVERSATION_PATH_PATTERN)?.[1] ?? "new-chat";
}
