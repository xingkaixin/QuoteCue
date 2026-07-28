import type { MessageAccess, SiteAdapter } from "./site-adapter";

const HISTORY_CHANGE_EVENT = "quotecue:history-change";
const HISTORY_PATCH_STATE_PROPERTY = "quotecue:history-change:patch";

type HistoryMethod = History["pushState"];
type HistoryMethodName = "pushState" | "replaceState";

type HistoryPatchState = {
  original: Record<HistoryMethodName, HistoryMethod>;
  subscriberCount: number;
  wrapped: Record<HistoryMethodName, HistoryMethod>;
};

export type {
  ComposerSnapshot,
  HostResult,
  HostUnavailableReason,
  SelectionCaptureIntent,
  SelectionInvalidation,
} from "@/features/host-port/host-port";

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
  callback: (records: readonly MutationRecord[]) => void;
  interest: MutationInterest;
};

type MutationSummary = {
  attributeNames: Set<string>;
  hasCharacterData: boolean;
  hasChildList: boolean;
};

type MutationObservationPlan = {
  attributeFilter: Set<string>;
  observesCharacterData: boolean;
  observesChildList: boolean;
};

type ViewportSubscription = {
  callback: () => void;
};

export function createHostContext(environment: HostEnvironment, adapter: SiteAdapter): HostContext {
  return {
    ...environment,
    adapter,
    signals: createHostSignals(environment.document, environment.window, adapter.messages),
  };
}

export function available<T>(value: T): { status: "available"; value: T } {
  return { status: "available", value };
}

export function unavailable<R extends string>(reason: R): { reason: R; status: "unavailable" } {
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

function createHostSignals(
  hostDocument: Document,
  hostWindow: Window,
  messageAccess: MessageAccess,
) {
  const mutationSubscriptions = new Set<MutationSubscription>();
  const viewportSubscriptions = new Set<ViewportSubscription>();
  let mutationObserver: MutationObserver | null = null;
  let mutationObservationPlan: MutationObservationPlan | null = null;
  let observedMessageRoots = new Set<HTMLElement>();

  const dispatchMutations = (records: MutationRecord[]) => {
    const observesCharacterData = mutationObservationPlan?.observesCharacterData === true;
    if (observesCharacterData) {
      observeAddedMessageRoots(records);
    }
    const summary = summarizeMutations(records);
    for (const subscription of [...mutationSubscriptions]) {
      if (matchesMutationInterest(summary, subscription.interest)) {
        subscription.callback(records);
      }
    }
    if (observesCharacterData && removesMessageRoot(records)) {
      updateMutationObservation(true);
    }
  };
  // MutationObserver cannot unobserve a single target, so a detached message root still costs a
  // full rebuild. Unrelated removals must not pay it.
  const removesMessageRoot = (records: MutationRecord[]) => {
    for (const record of records) {
      if (record.type !== "childList") {
        continue;
      }
      for (const node of record.removedNodes) {
        if (node instanceof Element && containsMessageRoot(node)) {
          return true;
        }
      }
    }
    return false;
  };
  const containsMessageRoot = (node: Element) => {
    if (node instanceof HTMLElement && observedMessageRoots.has(node)) {
      return true;
    }
    return [messageAccess.assistantSelector, messageAccess.userSelector].some(
      (selector) => node.matches(selector) || node.querySelector(selector) !== null,
    );
  };
  const updateMutationObservation = (forceReset = false) => {
    if (mutationSubscriptions.size === 0) {
      mutationObserver?.disconnect();
      mutationObserver = null;
      mutationObservationPlan = null;
      observedMessageRoots = new Set();
      return;
    }

    const nextPlan = createMutationObservationPlan(mutationSubscriptions);
    if (
      !forceReset &&
      mutationObservationPlan &&
      sameMutationObservationPlan(mutationObservationPlan, nextPlan)
    ) {
      return;
    }

    mutationObserver ??= new MutationObserver(dispatchMutations);
    const removesMessageObservation =
      mutationObservationPlan?.observesCharacterData === true && !nextPlan.observesCharacterData;
    if (forceReset || removesMessageObservation) {
      mutationObserver.disconnect();
      observedMessageRoots = new Set();
    }
    mutationObservationPlan = nextPlan;
    mutationObserver.observe(hostDocument.body, {
      ...(nextPlan.attributeFilter.size > 0
        ? { attributeFilter: [...nextPlan.attributeFilter], attributes: true }
        : {}),
      childList: nextPlan.observesChildList,
      subtree: true,
    });
    if (nextPlan.observesCharacterData) {
      observeMessageRootsWithin(hostDocument);
    }
  };
  const observeAddedMessageRoots = (records: MutationRecord[]) => {
    for (const record of records) {
      if (record.type !== "childList") {
        continue;
      }
      for (const node of record.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          observeMessageRootsWithin(node as Element);
        }
      }
    }
  };
  const observeMessageRootsWithin = (root: ParentNode) => {
    for (const selector of [messageAccess.assistantSelector, messageAccess.userSelector]) {
      if (root instanceof Element && root.matches(selector)) {
        observeMessageRoot(root);
      }
      for (const message of root.querySelectorAll<HTMLElement>(selector)) {
        observeMessageRoot(message);
      }
    }
  };
  const observeMessageRoot = (message: Element) => {
    if (
      !mutationObserver ||
      !(message instanceof HTMLElement) ||
      observedMessageRoots.has(message) ||
      hasObservedMessageAncestor(message)
    ) {
      return;
    }
    observedMessageRoots.add(message);
    mutationObserver.observe(message, { characterData: true, subtree: true });
  };
  const hasObservedMessageAncestor = (message: HTMLElement) => {
    let ancestor = message.parentElement;
    while (ancestor) {
      if (observedMessageRoots.has(ancestor)) {
        return true;
      }
      ancestor = ancestor.parentElement;
    }
    return false;
  };
  const onViewportChange = () => {
    for (const { callback } of [...viewportSubscriptions]) {
      callback();
    }
  };

  return {
    observeMutations(
      callback: (records: readonly MutationRecord[]) => void,
      interest: MutationInterest,
    ) {
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
      const releaseHistoryPatch = acquireHistoryPatch(hostWindow);
      hostWindow.addEventListener(HISTORY_CHANGE_EVENT, callback);
      hostWindow.addEventListener("popstate", callback);

      return once(() => {
        hostWindow.removeEventListener(HISTORY_CHANGE_EVENT, callback);
        hostWindow.removeEventListener("popstate", callback);
        releaseHistoryPatch();
      });
    },
  };
}

function createMutationObservationPlan(
  subscriptions: ReadonlySet<MutationSubscription>,
): MutationObservationPlan {
  const attributeFilter = new Set<string>();
  let observesCharacterData = false;
  let observesChildList = false;
  for (const { interest } of subscriptions) {
    for (const attribute of interest.attributeFilter ?? []) {
      attributeFilter.add(attribute);
    }
    observesCharacterData ||= interest.characterData === true;
    observesChildList ||= interest.childList === true;
  }
  return {
    attributeFilter,
    observesCharacterData,
    observesChildList: observesCharacterData || observesChildList,
  };
}

function sameMutationObservationPlan(
  current: MutationObservationPlan,
  next: MutationObservationPlan,
) {
  return (
    current.observesCharacterData === next.observesCharacterData &&
    current.observesChildList === next.observesChildList &&
    current.attributeFilter.size === next.attributeFilter.size &&
    [...current.attributeFilter].every((attribute) => next.attributeFilter.has(attribute))
  );
}

function summarizeMutations(records: MutationRecord[]): MutationSummary {
  const summary: MutationSummary = {
    attributeNames: new Set(),
    hasCharacterData: false,
    hasChildList: false,
  };
  for (const record of records) {
    if (record.type === "attributes" && record.attributeName !== null) {
      summary.attributeNames.add(record.attributeName);
    } else if (record.type === "characterData") {
      summary.hasCharacterData = true;
    } else if (record.type === "childList") {
      summary.hasChildList = true;
    }
  }
  return summary;
}

function matchesMutationInterest(summary: MutationSummary, interest: MutationInterest) {
  return (
    (interest.childList === true && summary.hasChildList) ||
    (interest.characterData === true && summary.hasCharacterData) ||
    interest.attributeFilter?.some((attribute) => summary.attributeNames.has(attribute)) === true
  );
}

function acquireHistoryPatch(hostWindow: Window) {
  const patch = currentHistoryPatch(hostWindow) ?? installHistoryPatch(hostWindow);
  patch.subscriberCount += 1;

  return once(() => {
    patch.subscriberCount -= 1;
    if (patch.subscriberCount > 0) {
      return;
    }

    restoreHistoryMethod(hostWindow, patch, "pushState");
    restoreHistoryMethod(hostWindow, patch, "replaceState");
  });
}

function currentHistoryPatch(hostWindow: Window) {
  const pushStatePatch = historyPatchFor(hostWindow.history.pushState);
  const replaceStatePatch = historyPatchFor(hostWindow.history.replaceState);
  return pushStatePatch === replaceStatePatch ? pushStatePatch : undefined;
}

function historyPatchFor(method: HistoryMethod) {
  return Reflect.get(method, HISTORY_PATCH_STATE_PROPERTY) as HistoryPatchState | undefined;
}

function installHistoryPatch(hostWindow: Window): HistoryPatchState {
  const original = {
    pushState: hostWindow.history.pushState,
    replaceState: hostWindow.history.replaceState,
  };
  const wrapped = {
    pushState: wrapHistoryMethod(hostWindow, original.pushState),
    replaceState: wrapHistoryMethod(hostWindow, original.replaceState),
  };
  const patch = { original, subscriberCount: 0, wrapped };

  Object.defineProperty(wrapped.pushState, HISTORY_PATCH_STATE_PROPERTY, { value: patch });
  Object.defineProperty(wrapped.replaceState, HISTORY_PATCH_STATE_PROPERTY, { value: patch });
  hostWindow.history.pushState = wrapped.pushState;
  hostWindow.history.replaceState = wrapped.replaceState;
  return patch;
}

function restoreHistoryMethod(
  hostWindow: Window,
  patch: HistoryPatchState,
  method: HistoryMethodName,
) {
  if (hostWindow.history[method] === patch.wrapped[method]) {
    hostWindow.history[method] = patch.original[method];
  }
}

function wrapHistoryMethod(hostWindow: Window, original: HistoryMethod): HistoryMethod {
  return function (this: History, data: unknown, unused: string, url?: string | URL | null) {
    original.call(this, data, unused, url);
    hostWindow.dispatchEvent(new Event(HISTORY_CHANGE_EVENT));
  };
}
