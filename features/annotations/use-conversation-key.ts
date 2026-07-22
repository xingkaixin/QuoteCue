import { useCallback, useEffect, useState } from "react";

import { activeHost } from "@/features/host/active-host";

export function useConversationKey() {
  const [temporaryConversationKey] = useState(() => `new-chat:${crypto.randomUUID()}`);
  const resolveConversationKey = useCallback(
    () => activeHost.conversation.key(temporaryConversationKey),
    [temporaryConversationKey],
  );
  const [conversationKey, setConversationKey] = useState(resolveConversationKey);

  useEffect(() => {
    const refresh = () => {
      const nextKey = resolveConversationKey();
      setConversationKey((currentKey) => (currentKey === nextKey ? currentKey : nextKey));
    };
    return activeHost.conversation.subscribe(refresh);
  }, [resolveConversationKey]);

  return conversationKey;
}
