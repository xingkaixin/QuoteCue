import { useEffect, useState } from "react";

import { useHost } from "@/features/host-port/HostProvider";

import { sameConversationIdentity } from "@/features/conversation/conversation-identity";

export function useConversationIdentity() {
  const host = useHost();
  const [conversationIdentity, setConversationIdentity] = useState(() =>
    host.conversation.identity(crypto.randomUUID()),
  );

  useEffect(() => {
    const refresh = () => {
      const nextIdentity = host.conversation.identity(crypto.randomUUID());
      setConversationIdentity((currentIdentity) => {
        return (currentIdentity.kind === "unidentified" && nextIdentity.kind === "unidentified") ||
          sameConversationIdentity(currentIdentity, nextIdentity)
          ? currentIdentity
          : nextIdentity;
      });
    };
    const unsubscribe = host.conversation.subscribe(refresh);
    refresh();
    return unsubscribe;
  }, [host]);

  return conversationIdentity;
}
