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

export type SelectionInvalidation =
  | { reason: "layout" }
  | { dirtyMessageIds: ReadonlySet<string> | "all"; reason: "content" };
export type SelectionCaptureIntent = "capture" | "dismiss";

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
  send: SelectionRect;
  summary: Pick<SelectionRect, "left" | "top">;
};

type ConfirmedSendWatcherOptions = {
  expectedText: string;
  onConfirmed: () => void;
  onTimeout: () => void;
  signal: AbortSignal;
};

export type NativeSelectionAction = {
  mount(options: { label: string; onActivate: () => void; rect: SelectionRect }): () => void;
};

type HostSelectionBase = {
  capture(selection?: Selection | null): HostResult<SelectionCapture>;
  clear(): void;
  messageIndex(messageIds?: ReadonlySet<string>): Map<string, HTMLElement>;
  observeCaptureIntent(callback: (intent: SelectionCaptureIntent) => void): () => void;
  observeInvalidation(callback: (invalidation: SelectionInvalidation) => void): () => void;
  reveal(range: Range): HostResult<"scrolled" | "visible">;
};

export type HostSelection = HostSelectionBase &
  (
    | {
        nativeAction: NativeSelectionAction;
        presentation: "native-toolbar";
      }
    | {
        nativeAction?: never;
        presentation: "overlay";
      }
  );

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
    reserveAnnotationRow(height: number): () => void;
    subscribe(callback: () => void): () => void;
  };
  reportUnavailable(reason: HostUnavailableReason): void;
  selection: HostSelection;
};
