export type HostUnavailableReason =
  | "assistant-message-unavailable"
  | "composer-surface-unavailable"
  | "composer-unavailable"
  | "selection-unavailable"
  | "send-control-unavailable";

export type HostResult<T> =
  | { status: "available"; value: T }
  | { status: "unavailable"; reason: HostUnavailableReason };

export type ComposerSnapshot = {
  element: HTMLElement;
  text: string;
};

export type IdentifiedConversation = {
  kind: "identified";
  id: string;
};

export type UnidentifiedConversation = {
  kind: "unidentified";
  sessionKey: string;
};

export type ConversationIdentity = IdentifiedConversation | UnidentifiedConversation;

export type SelectionInvalidationReason = "content" | "layout";
export type SelectionPresentationMode = "native-toolbar" | "overlay";

type TextAnchorBase = {
  end: number;
  messageId: string;
  prefix: string;
  quote: string;
  start: number;
  suffix: string;
};

export type TextAnchor = TextAnchorBase &
  (
    | { displayQuote?: string; format: "exact" }
    | { displayQuote?: never; format: "legacy-rendered" }
  );

export type SelectionRect = Pick<DOMRect, "bottom" | "height" | "left" | "right" | "top" | "width">;

export type AnchoredSelection = {
  anchor: TextAnchor;
  rect: SelectionRect;
};

export type SelectionCapture = AnchoredSelection & {
  actionRect: SelectionRect;
};

export type HostLayout = {
  action: HTMLElement | null;
  send: SelectionRect;
  summary: Pick<SelectionRect, "left" | "top">;
  surface: HTMLElement;
};

type ConfirmedSendWatcherOptions = {
  expectedText: string;
  onConfirmed: () => void;
  onTimeout: () => void;
  signal: AbortSignal;
};

export type Host = {
  composer: {
    isButtonAvailable(button: HTMLElement | null): button is HTMLElement;
    replaceText(composer: HTMLElement, text: string): boolean;
    restoreText(snapshot: ComposerSnapshot, expectedText: string): boolean;
    snapshot(): HostResult<ComposerSnapshot>;
    subscribeToSubmit(callback: (event: Event, button: HTMLElement | null) => void): () => void;
    waitForButton(signal: AbortSignal): Promise<HostResult<HTMLElement>>;
    watchConfirmedSend(options: ConfirmedSendWatcherOptions): () => void;
  };
  conversation: {
    identity(sessionKey: string): ConversationIdentity;
    subscribe(callback: () => void): () => void;
  };
  layout: {
    current(): HostResult<HostLayout>;
    subscribe(callback: () => void): () => void;
  };
  reportUnavailable(reason: HostUnavailableReason): void;
  selection: {
    capture(selection?: Selection | null): HostResult<SelectionCapture>;
    clear(): void;
    messageIndex(root?: ParentNode): Map<string, HTMLElement>;
    mountAction(options: {
      label: string;
      onActivate: () => void;
      rect: SelectionRect;
    }): () => void;
    observeInvalidation(callback: (reason: SelectionInvalidationReason) => void): () => void;
    presentation: SelectionPresentationMode;
    reveal(range: Range): HostResult<"scrolled" | "visible">;
  };
};
