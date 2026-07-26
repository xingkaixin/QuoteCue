import { useCallback, useEffect, useState } from "react";

import { useHost } from "@/features/host-port/HostProvider";

import { sameConversationIdentity } from "./conversation-identity";

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
    return host.conversation.subscribe(refresh);
  }, [host, resolveConversationIdentity]);

  return conversationIdentity;
}
