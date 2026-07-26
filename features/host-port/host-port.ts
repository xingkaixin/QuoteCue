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

export type SelectionInvalidationReason = "content" | "layout";
export type SelectionPresentationMode = "native-toolbar" | "overlay";

export type TextAnchor = {
  displayQuote?: string;
  end: number;
  messageId: string;
  prefix: string;
  quote: string;
  start: number;
  suffix: string;
};

export type SelectionRect = Pick<DOMRect, "bottom" | "height" | "left" | "right" | "top" | "width">;

export type SelectionDraft = {
  anchor: TextAnchor;
  rect: SelectionRect;
};

export type SelectionCapture = SelectionDraft & {
  actionRect: SelectionRect;
};

export type HostLayout = {
  action: HTMLElement | null;
  send: SelectionRect;
  summary: Pick<SelectionRect, "left" | "top">;
  surface: HTMLElement;
};

type AcceptedSendWatcherOptions = {
  expectedText: string;
  onAccepted: () => void;
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
    watchAcceptedSend(options: AcceptedSendWatcherOptions): () => void;
  };
  conversation: {
    key(temporaryConversationKey: string): string;
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
