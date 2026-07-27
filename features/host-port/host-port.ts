export type HostUnavailableReason =
  | "assistant-message-unavailable"
  | "composer-surface-unavailable"
  | "composer-unavailable"
  | "selection-unavailable"
  | "send-control-unavailable";

export type HostResult<T, R extends string = HostUnavailableReason> =
  | { status: "available"; value: T }
  | { status: "unavailable"; reason: R };

export type ComposerSnapshot = {
  element: HTMLElement;
  text: string;
};

export type ComposerSubmitFailureReason =
  | "confirmation-timeout"
  | "replace-failed"
  | "send-unavailable";

export type ComposerSubmitOptions = {
  restoreTo: ComposerSnapshot;
  signal: AbortSignal;
  text: string;
};

export type ComposerSubmitResult = HostResult<"confirmed", ComposerSubmitFailureReason>;

export type ComposerSubmitIntent = {
  event: Event;
  isSendAvailable: boolean;
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

export type NativeSelectionAction = {
  mount(options: { label: string; onActivate: () => void; rect: SelectionRect }): () => void;
};

type HostSelectionBase = {
  capture(selection?: Selection | null): HostResult<SelectionCapture>;
  clear(): void;
  highlight(range: Range | null): void;
  isObscured(range: Range, rect: SelectionRect): boolean;
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
    snapshot(): HostResult<ComposerSnapshot>;
    submit(options: ComposerSubmitOptions): Promise<ComposerSubmitResult>;
    subscribeToSubmit(callback: (intent: ComposerSubmitIntent) => void): () => void;
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
