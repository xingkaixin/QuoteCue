import { useCallback, useEffect, useState } from "react";

import { useHost } from "@/features/host-port/HostProvider";

import { sameConversationIdentity } from "@/features/conversation/conversation-identity";

export function useConversationIdentity() {
  const host = useHost();
  const [sessionKey] = useState(() => crypto.randomUUID());
  const resolveConversationIdentity = useCallback(
    () => host.conversation.identity(sessionKey),
    [host, sessionKey],
  );
  const [conversationIdentity, setConversationIdentity] = useState(resolveConversationIdentity);

  useEffect(() => {
    const refresh = () => {
      const nextIdentity = resolveConversationIdentity();
      setConversationIdentity((currentIdentity) =>
        sameConversationIdentity(currentIdentity, nextIdentity) ? currentIdentity : nextIdentity,
      );
    };
    const unsubscribe = host.conversation.subscribe(refresh);
    refresh();
    return unsubscribe;
  }, [host, resolveConversationIdentity]);

  return conversationIdentity;
}
