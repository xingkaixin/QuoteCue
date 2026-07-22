import { useCallback, useEffect, useState } from "react";

import { chatGptHost } from "@/features/chatgpt/chatgpt-host";

export function useConversationKey() {
  const [temporaryConversationKey] = useState(() => `new-chat:${crypto.randomUUID()}`);
  const resolveConversationKey = useCallback(
    () => chatGptHost.conversation.key(temporaryConversationKey),
    [temporaryConversationKey],
  );
  const [conversationKey, setConversationKey] = useState(resolveConversationKey);

  useEffect(() => {
    const refresh = () => {
      const nextKey = resolveConversationKey();
      setConversationKey((currentKey) => (currentKey === nextKey ? currentKey : nextKey));
    };
    return chatGptHost.conversation.subscribe(refresh);
  }, [resolveConversationKey]);

  return conversationKey;
}
