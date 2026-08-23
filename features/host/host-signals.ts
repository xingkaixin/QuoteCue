import type { MessageAccess } from "./site-adapter";

const LOCATION_POLL_INTERVAL_MS = 1_000;

type MutationInterest = {
  characterData?: boolean;
  childList?: boolean;
};

type MutationSubscription = {
  callback: (records: readonly MutationRecord[]) => void;
  interest: MutationInterest;
};

type MutationSummary = {
  hasCharacterData: boolean;
  hasChildList: boolean;
};

type MutationObservationPlan = {
  observesCharacterData: boolean;
  observesChildList: boolean;
};

type ViewportSubscription = {
  callback: () => void;
};

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

export function createHostSignals(
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
      return subscribeNavigation(hostWindow, callback);
    },
  };
}

function createMutationObservationPlan(
  subscriptions: ReadonlySet<MutationSubscription>,
): MutationObservationPlan {
  let observesCharacterData = false;
  let observesChildList = false;
  for (const { interest } of subscriptions) {
    observesCharacterData ||= interest.characterData === true;
    observesChildList ||= interest.childList === true;
  }
  return {
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
    current.observesChildList === next.observesChildList
  );
}

function summarizeMutations(records: MutationRecord[]): MutationSummary {
  const summary: MutationSummary = {
    hasCharacterData: false,
    hasChildList: false,
  };
  for (const record of records) {
    if (record.type === "characterData") {
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
    (interest.characterData === true && summary.hasCharacterData)
  );
}

function subscribeNavigation(hostWindow: Window, callback: () => void) {
  const navigation = navigationEventSource(hostWindow);
  if (navigation) {
    navigation.addEventListener("currententrychange", callback);
    return once(() => {
      navigation.removeEventListener("currententrychange", callback);
    });
  }

  let lastUrl = hostWindow.location.href;
  const notifyIfChanged = () => {
    const nextUrl = hostWindow.location.href;
    if (nextUrl === lastUrl) {
      return;
    }
    lastUrl = nextUrl;
    callback();
  };
  const interval = hostWindow.setInterval(notifyIfChanged, LOCATION_POLL_INTERVAL_MS);
  hostWindow.addEventListener("popstate", notifyIfChanged);
  return once(() => {
    hostWindow.clearInterval(interval);
    hostWindow.removeEventListener("popstate", notifyIfChanged);
  });
}

function navigationEventSource(hostWindow: Window): EventTarget | null {
  const navigation: unknown = Reflect.get(hostWindow, "navigation");
  return navigation !== null &&
    typeof navigation === "object" &&
    "addEventListener" in navigation &&
    typeof navigation.addEventListener === "function" &&
    "removeEventListener" in navigation &&
    typeof navigation.removeEventListener === "function"
    ? (navigation as EventTarget)
    : null;
}
