import { useCallback, useEffect, useState } from "react";

import { conversationKeyFromPathname, createTemporaryConversationKey } from "./conversation-key";

export function useConversationKey() {
  const [temporaryConversationKey] = useState(createTemporaryConversationKey);
  const resolveConversationKey = useCallback(
    () => conversationKeyFromPathname(window.location.pathname, temporaryConversationKey),
    [temporaryConversationKey],
  );
  const [conversationKey, setConversationKey] = useState(resolveConversationKey);

  useEffect(() => {
    const refresh = () => {
      const nextKey = resolveConversationKey();
      setConversationKey((currentKey) => (currentKey === nextKey ? currentKey : nextKey));
    };
    const observer = new MutationObserver(refresh);

    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("popstate", refresh);

    return () => {
      observer.disconnect();
      window.removeEventListener("popstate", refresh);
    };
  }, [resolveConversationKey]);

  return conversationKey;
}
