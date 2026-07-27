import type {
  ConversationIdentity,
  Host,
  HostLayout,
  HostResult,
  SelectionCaptureIntent,
  SelectionInvalidation,
} from "@/features/host-port/host-port";

type FakeHostOverrides = {
  composer?: Partial<Host["composer"]>;
  conversation?: Partial<Host["conversation"]>;
  layout?: Partial<Host["layout"]>;
  reportUnavailable?: Host["reportUnavailable"];
};

export type FakeHost = Host & {
  controls: {
    emitLayoutChange(): void;
    emitSelectionCaptureIntent(intent: SelectionCaptureIntent): void;
    emitSelectionInvalidation(invalidation: SelectionInvalidation): void;
    setConversationIdentity(identity: ConversationIdentity | null): void;
    setLayout(layout: HostResult<HostLayout>): void;
    setMessageIndex(index: ReadonlyMap<string, HTMLElement>): void;
    setSelectionCapture(capture: ReturnType<Host["selection"]["capture"]>): void;
  };
  elements: {
    composer: HTMLElement;
    sendControl: HTMLButtonElement;
    surface: HTMLElement;
  };
};

export function createFakeHost(overrides: FakeHostOverrides = {}): FakeHost {
  const composer = document.createElement("div");
  const sendControl = document.createElement("button");
  const surface = document.createElement("div");
  let composerText = "";
  let conversationIdentity: ConversationIdentity | null = null;
  let messageIndex = new Map<string, HTMLElement>();
  let selectionCapture: ReturnType<Host["selection"]["capture"]> = {
    reason: "selection-unavailable",
    status: "unavailable",
  };
  let layout: HostResult<HostLayout> = {
    status: "available",
    value: {
      send: { bottom: 236, height: 36, left: 200, right: 236, top: 200, width: 36 },
      summary: { left: 10, top: 10 },
    },
  };
  const conversationSubscribers = new Set<() => void>();
  const layoutSubscribers = new Set<() => void>();
  const selectionCaptureSubscribers = new Set<(intent: SelectionCaptureIntent) => void>();
  const selectionSubscribers = new Set<(invalidation: SelectionInvalidation) => void>();
  const submitSubscribers = new Set<Parameters<Host["composer"]["subscribeToSubmit"]>[0]>();

  sendControl.addEventListener("click", () => {
    const event = new Event("click", { cancelable: true });
    for (const subscriber of submitSubscribers) {
      subscriber({ event, isSendAvailable: true });
    }
  });

  const defaultHost: Host = {
    composer: {
      snapshot: () => ({
        status: "available",
        value: { element: composer, text: composerText },
      }),
      async submit({ restoreTo, signal, text }) {
        if (signal.aborted) {
          return { reason: "send-unavailable", status: "unavailable" };
        }
        composerText = text;
        composer.textContent = text;
        await Promise.resolve();
        if (signal.aborted) {
          composerText = restoreTo.text;
          composer.textContent = restoreTo.text;
          return { reason: "send-unavailable", status: "unavailable" };
        }
        return { status: "available", value: "confirmed" };
      },
      subscribeToSubmit(callback) {
        submitSubscribers.add(callback);
        return () => submitSubscribers.delete(callback);
      },
    },
    conversation: {
      identity(sessionKey) {
        return conversationIdentity ?? { kind: "unidentified", sessionKey };
      },
      subscribe(callback) {
        conversationSubscribers.add(callback);
        return () => conversationSubscribers.delete(callback);
      },
    },
    layout: {
      current: () => layout,
      reserveAnnotationRow: () => () => undefined,
      subscribe(callback) {
        layoutSubscribers.add(callback);
        return () => layoutSubscribers.delete(callback);
      },
    },
    reportUnavailable: () => undefined,
    selection: {
      capture: () => selectionCapture,
      clear: () => undefined,
      highlight: () => undefined,
      isObscured: () => false,
      messageIndex: () => new Map(messageIndex),
      observeCaptureIntent(callback) {
        selectionCaptureSubscribers.add(callback);
        return () => selectionCaptureSubscribers.delete(callback);
      },
      observeInvalidation(callback) {
        selectionSubscribers.add(callback);
        return () => selectionSubscribers.delete(callback);
      },
      presentation: "overlay",
      reveal: () => ({ status: "available", value: "visible" }),
    },
  };

  return {
    ...defaultHost,
    composer: { ...defaultHost.composer, ...overrides.composer },
    conversation: { ...defaultHost.conversation, ...overrides.conversation },
    controls: {
      emitLayoutChange() {
        for (const subscriber of layoutSubscribers) {
          subscriber();
        }
      },
      emitSelectionCaptureIntent(intent) {
        for (const subscriber of selectionCaptureSubscribers) {
          subscriber(intent);
        }
      },
      emitSelectionInvalidation(invalidation) {
        for (const subscriber of selectionSubscribers) {
          subscriber(invalidation);
        }
      },
      setConversationIdentity(identity) {
        conversationIdentity = identity;
        for (const subscriber of conversationSubscribers) {
          subscriber();
        }
      },
      setLayout(nextLayout) {
        layout = nextLayout;
      },
      setMessageIndex(index) {
        messageIndex = new Map(index);
      },
      setSelectionCapture(capture) {
        selectionCapture = capture;
      },
    },
    elements: { composer, sendControl, surface },
    layout: { ...defaultHost.layout, ...overrides.layout },
    reportUnavailable: overrides.reportUnavailable ?? defaultHost.reportUnavailable,
    selection: defaultHost.selection,
  };
}
