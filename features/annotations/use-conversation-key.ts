import { useEffect, useState } from "react";

import { currentConversationKey } from "./conversation-key";

export function useConversationKey() {
  const [conversationKey, setConversationKey] = useState(currentConversationKey);

  useEffect(() => {
    const refresh = () => {
      const nextKey = currentConversationKey();
      setConversationKey((currentKey) => (currentKey === nextKey ? currentKey : nextKey));
    };
    const observer = new MutationObserver(refresh);

    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("popstate", refresh);

    return () => {
      observer.disconnect();
      window.removeEventListener("popstate", refresh);
    };
  }, []);

  return conversationKey;
}
