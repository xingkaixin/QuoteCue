import type { HostEnvironment } from "./host-environment";

export type ComposerAccess = {
  normalize(text: string): string;
  read(composer: HTMLElement): string;
  selector: string;
  write(composer: HTMLElement, text: string, environment: HostEnvironment): boolean;
};

export type ComposerLayoutAccess = {
  actionSelector: string;
  boundarySelector?: string;
  surfaceSelector: string;
  visibleActionsOnly?: boolean;
};

export type SelectionToolbarBounds = {
  maxHeight: number;
  maxVerticalDistance: number;
  maxWidth: number;
  minHeight: number;
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
  conversationId(pathname: string): string | null;
  layout: ComposerLayoutAccess;
  messages: MessageAccess;
  selectionPresentation: SelectionPresentationAccess;
  sendControl: SendControlAccess;
};

export type ComposerLayoutOptions = Pick<
  ComposerLayoutAccess,
  "boundarySelector" | "visibleActionsOnly"
>;

type MessageAccessOptions = Omit<MessageAccess, "isAssistant"> & {
  isAssistant?: MessageAccess["isAssistant"];
};

export function composerLayout(
  actionSelector: string,
  surfaceSelector: string,
  options: ComposerLayoutOptions = {},
): ComposerLayoutAccess {
  return {
    actionSelector,
    surfaceSelector,
    ...(options.boundarySelector ? { boundarySelector: options.boundarySelector } : {}),
    ...(options.visibleActionsOnly ? { visibleActionsOnly: true } : {}),
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
