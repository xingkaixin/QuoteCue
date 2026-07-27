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
  boundarySelector?: string;
  surfaceSelector?: string;
};

export type SelectionToolbarBounds = {
  maxHeight: number;
  maxVerticalDistance: number;
  maxWidth: number;
  minHeight: number;
  minWidth: number;
};

export type SelectionPresentationAccess =
  | { mode: "native-toolbar"; toolbarBounds?: SelectionToolbarBounds }
  | { mode: "overlay" };

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
  selectionPresentation: SelectionPresentationAccess;
  sendControl: SendControlAccess;
};

export type ComposerLayoutOptions = Pick<
  ComposerLayoutAccess,
  "boundarySelector" | "surfaceSelector"
>;

type MessageAccessOptions = Omit<MessageAccess, "isAssistant"> & {
  isAssistant?: MessageAccess["isAssistant"];
};

export function composerLayout(
  actionSelector: string,
  options: ComposerLayoutOptions = {},
): ComposerLayoutAccess {
  return {
    actionSelector,
    ...(options.boundarySelector ? { boundarySelector: options.boundarySelector } : {}),
    ...(options.surfaceSelector ? { surfaceSelector: options.surfaceSelector } : {}),
  };
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
