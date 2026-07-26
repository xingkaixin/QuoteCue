import type { MessageAccess, SendControlAccess } from "./host-context";

type MessageAccessOptions = Omit<MessageAccess, "isAssistant"> & {
  isAssistant?: MessageAccess["isAssistant"];
};

export function messageAccess(options: MessageAccessOptions): MessageAccess {
  return {
    isAssistant: () => true,
    ...options,
  };
}

export function sendControlAccess(
  selector: string,
  isDisabled: SendControlAccess["isDisabled"] = () => false,
): SendControlAccess {
  return { isDisabled, selector };
}
