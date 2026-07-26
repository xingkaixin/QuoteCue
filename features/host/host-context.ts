import type {
  HostResult,
  HostUnavailableReason,
  SelectionPresentationMode,
} from "@/features/host-port/host-port";

const HISTORY_CHANGE_EVENT = "quotecue:history-change";
const historyPatchedWindows = new WeakSet<Window>();

export type {
  ComposerSnapshot,
  HostResult,
  HostUnavailableReason,
  SelectionInvalidationReason,
} from "@/features/host-port/host-port";

export type ComposerAccess = {
  normalize(text: string): string;
  read(composer: HTMLElement): string;
  selector: string;
  write(composer: HTMLElement, text: string, environment: HostEnvironment): boolean;
};

export type ComposerLayoutCapability = {
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
  layout: ComposerLayoutCapability;
  messages: MessageAccess;
  selectionPresentation: { mode: SelectionPresentationMode };
  sendControl: SendControlAccess;
};

export type HostEnvironment = {
  document: Document;
  logger?: (message: string) => void;
  window: Window;
};

export type HostContext = HostEnvironment & {
  adapter: SiteAdapter;
  signals: ReturnType<typeof createHostSignals>;
};

type MutationInterest = {
  attributeFilter?: readonly string[];
  characterData?: boolean;
  childList?: boolean;
};

type MutationSubscription = {
  callback: () => void;
  interest: MutationInterest;
};

type ViewportSubscription = {
  callback: () => void;
};

export function createHostContext(environment: HostEnvironment, adapter: SiteAdapter): HostContext {
  return {
    ...environment,
    adapter,
    signals: createHostSignals(environment.document, environment.window),
  };
}

export function available<T>(value: T): HostResult<T> {
  return { status: "available", value };
}

export function unavailable(reason: HostUnavailableReason): HostResult<never> {
  return { reason, status: "unavailable" };
}

export function once(callback: () => void) {
  let active = true;
  return () => {
    if (!active) {
      return;
    }
    active = false;
    callback();
  };
}

function createHostSignals(hostDocument: Document, hostWindow: Window) {
  const mutationSubscriptions = new Set<MutationSubscription>();
  const viewportSubscriptions = new Set<ViewportSubscription>();
  let mutationObserver: MutationObserver | null = null;

  const dispatchMutations = (records: MutationRecord[]) => {
    for (const subscription of [...mutationSubscriptions]) {
      if (records.some((record) => matchesMutationInterest(record, subscription.interest))) {
        subscription.callback();
      }
    }
  };
  const updateMutationObservation = () => {
    if (mutationSubscriptions.size === 0) {
      mutationObserver?.disconnect();
      mutationObserver = null;
      return;
    }

    mutationObserver ??= new MutationObserver(dispatchMutations);
    const interests = [...mutationSubscriptions].map(({ interest }) => interest);
    const attributeFilter = [
      ...new Set(interests.flatMap(({ attributeFilter: attributes }) => attributes ?? [])),
    ];
    mutationObserver.observe(hostDocument.body, {
      ...(attributeFilter.length > 0 ? { attributeFilter, attributes: true } : {}),
      characterData: interests.some(({ characterData }) => characterData),
      childList: interests.some(({ childList }) => childList),
      subtree: true,
    });
  };
  const onViewportChange = () => {
    for (const { callback } of [...viewportSubscriptions]) {
      callback();
    }
  };

  return {
    observeMutations(callback: () => void, interest: MutationInterest) {
      const subscription = { callback, interest };
      mutationSubscriptions.add(subscription);
      updateMutationObservation();

      return once(() => {
        mutationSubscriptions.delete(subscription);
        updateMutationObservation();
      });
    },
    observeViewport(callback: () => void) {
      const subscription = { callback };
      viewportSubscriptions.add(subscription);
      if (viewportSubscriptions.size === 1) {
        hostWindow.addEventListener("resize", onViewportChange);
        hostWindow.addEventListener("scroll", onViewportChange, true);
      }

      return once(() => {
        viewportSubscriptions.delete(subscription);
        if (viewportSubscriptions.size === 0) {
          hostWindow.removeEventListener("resize", onViewportChange);
          hostWindow.removeEventListener("scroll", onViewportChange, true);
        }
      });
    },
    subscribeNavigation(callback: () => void) {
      patchHistoryOnce(hostWindow);
      hostWindow.addEventListener(HISTORY_CHANGE_EVENT, callback);
      hostWindow.addEventListener("popstate", callback);

      return once(() => {
        hostWindow.removeEventListener(HISTORY_CHANGE_EVENT, callback);
        hostWindow.removeEventListener("popstate", callback);
      });
    },
  };
}

function matchesMutationInterest(record: MutationRecord, interest: MutationInterest) {
  switch (record.type) {
    case "attributes":
      return (
        record.attributeName !== null && interest.attributeFilter?.includes(record.attributeName)
      );
    case "characterData":
      return interest.characterData === true;
    case "childList":
      return interest.childList === true;
    default:
      return false;
  }
}

function patchHistoryOnce(hostWindow: Window) {
  if (historyPatchedWindows.has(hostWindow)) {
    return;
  }

  historyPatchedWindows.add(hostWindow);
  wrapHistoryMethod(hostWindow, "pushState");
  wrapHistoryMethod(hostWindow, "replaceState");
}

function wrapHistoryMethod(hostWindow: Window, method: "pushState" | "replaceState") {
  const original = hostWindow.history[method];
  hostWindow.history[method] = function (data: unknown, unused: string, url?: string | URL | null) {
    original.call(this, data, unused, url);
    hostWindow.dispatchEvent(new Event(HISTORY_CHANGE_EVENT));
  };
}
