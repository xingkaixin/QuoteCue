import { vi } from "vitest";

import { numberAnnotations } from "@/features/annotations/annotation-projection";
import type { ConversationIdentity } from "@/features/conversation/conversation-identity";
import {
  registerSendInterceptor,
  type AnnotatedSendState,
} from "@/features/annotations/register-send-interceptor";
import { createChatGptHost } from "@/features/chatgpt/chatgpt-host";
import type { Host } from "@/features/host-port/host-port";

export const annotation = {
  id: "annotation-1",
  anchor: {
    format: "exact" as const,
    messageId: "message-1",
    quote: "selected text",
    prefix: "",
    suffix: "",
    start: 0,
    end: 13,
  },
  comment: "",
};

type CreateInterceptorOptions = {
  annotations?: readonly (typeof annotation)[];
  conversationIdentity?: () => ConversationIdentity;
  host?: Host;
  onStateChange?: (state: AnnotatedSendState) => void;
};

export function createInterceptor(
  onSendConfirmed = vi.fn(),
  {
    annotations = [annotation],
    conversationIdentity = () =>
      ({ kind: "identified", id: "conversation-test", siteId: "chatgpt" }) as const,
    host = createChatGptHost({ document, window }),
    onStateChange,
  }: CreateInterceptorOptions = {},
) {
  return registerSendInterceptor({
    getSendInput: () => ({
      annotations: numberAnnotations(annotations),
      conversationIdentity: conversationIdentity(),
      locale: "en",
    }),
    host,
    onSendConfirmed,
    onStateChange,
  });
}

export function availableComposer(host: Host) {
  const snapshot = host.composer.snapshot();
  if (snapshot.status === "unavailable") {
    throw new Error("Expected composer snapshot");
  }
  return snapshot.value;
}
