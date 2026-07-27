import type { SelectionPresentationMode } from "@/features/host-port/host-port";

import type { HostEnvironment } from "./host-context";

export { richTextComposer, textareaComposer } from "./composer-access";

export type ComposerAccess = {
  normalize(text: string): string;
  read(composer: HTMLElement): string;
  selector: string;
  write(composer: HTMLElement, text: string, environment: HostEnvironment): boolean;
};

export type ComposerLayoutAccess = {
  actionSelector: string;
  fallbackAction: {
    bottomInset: number;
    height: number;
    rightInset: number;
    width: number;
  };
};

export type MessageAccess = {
  assistantSelector: string;
  id(message: HTMLElement): string | undefined;
  isAssistant(message: HTMLElement): boolean;
  userSelector: string;
};

export type SendControlAccess = {
  isDisabled(button: HTMLElement): boolean;
  selector: string;
};

export type SiteAdapter = {
  composer: ComposerAccess;
  conversationPathPattern: RegExp;
  layout: ComposerLayoutAccess;
  messages: MessageAccess;
  selectionPresentation: { mode: SelectionPresentationMode };
  sendControl: SendControlAccess;
};

type MessageAccessOptions = Omit<MessageAccess, "isAssistant"> & {
  isAssistant?: MessageAccess["isAssistant"];
};

export function composerLayout(
  actionSelector: string,
  fallbackAction: ComposerLayoutAccess["fallbackAction"] = {
    bottomInset: 8,
    height: 36,
    rightInset: 8,
    width: 36,
  },
): ComposerLayoutAccess {
  return { actionSelector, fallbackAction };
}

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
