import { useCallback, useEffect, useState } from "react";

import { useHost } from "@/features/host-port/HostProvider";

export function useConversationKey() {
  const host = useHost();
  const [temporaryConversationKey] = useState(() => `new-chat:${crypto.randomUUID()}`);
  const resolveConversationKey = useCallback(
    () => host.conversation.key(temporaryConversationKey),
    [host, temporaryConversationKey],
  );
  const [conversationKey, setConversationKey] = useState(resolveConversationKey);

  useEffect(() => {
    const refresh = () => {
      const nextKey = resolveConversationKey();
      setConversationKey((currentKey) => (currentKey === nextKey ? currentKey : nextKey));
    };
    return host.conversation.subscribe(refresh);
  }, [host, resolveConversationKey]);

  return conversationKey;
}
