import type { ComposerSnapshot, HostResult } from "@/features/host-port/host-port";

import type { HostContext } from "./host-context";
import { available, unavailable } from "./host-result";

const COMPOSER_REPLACEMENT_TIMEOUT_MS = 2_000;

export function createComposerDriver(context: HostContext) {
  const { adapter, document: hostDocument, logger, window: hostWindow } = context;
  const composerAccess = adapter.composer;
  const targetBySnapshot = new WeakMap<
    ComposerSnapshot,
    { element: HTMLElement; pathname: string }
  >();

  const current = () => hostDocument.querySelector<HTMLElement>(adapter.composer.selector);

  function snapshot(): HostResult<ComposerSnapshot> {
    const element = current();
    if (!element) {
      return unavailable("composer-unavailable", logger);
    }
    const value = { text: composerAccess.read(element) } as ComposerSnapshot;
    targetBySnapshot.set(value, { element, pathname: hostWindow.location.pathname });
    return available(value);
  }

  function replaceText(composerSnapshot: ComposerSnapshot, text: string, signal: AbortSignal) {
    const composer = targetComposer(composerSnapshot);
    if (!composer || !writeText(composer, text)) {
      return Promise.resolve(false);
    }
    return waitForText(composerSnapshot, text, signal);
  }

  function waitForText(composerSnapshot: ComposerSnapshot, text: string, signal: AbortSignal) {
    const composer = targetComposer(composerSnapshot);
    if (!composer) {
      return Promise.resolve(false);
    }
    if (isCurrent(composerSnapshot, text)) {
      return Promise.resolve(true);
    }
    if (signal.aborted) {
      return Promise.resolve(false);
    }

    logger?.("[QuoteCue host] composer replacement waiting for render");
    return new Promise<boolean>((resolve) => {
      let timeout: number | undefined;
      const observer = new MutationObserver(() => {
        if (!targetComposer(composerSnapshot)) {
          finish(false);
        } else if (isCurrent(composerSnapshot, text)) {
          finish(true);
        }
      });
      const finish = (replaced: boolean) => {
        observer.disconnect();
        if (timeout !== undefined) {
          hostWindow.clearTimeout(timeout);
        }
        signal.removeEventListener("abort", onAbort);
        resolve(replaced);
      };
      const onAbort = () => finish(false);
      observer.observe(composer.parentElement ?? composer, {
        characterData: true,
        childList: true,
        subtree: true,
      });
      timeout = hostWindow.setTimeout(() => {
        logger?.("[QuoteCue host] composer replacement timed out");
        finish(false);
      }, COMPOSER_REPLACEMENT_TIMEOUT_MS);
      signal.addEventListener("abort", onAbort, { once: true });
    });
  }

  function writeText(composer: HTMLElement, text: string) {
    if (!composer.isConnected) {
      return false;
    }

    composer.focus();
    return adapter.composer.write(composer, text, context);
  }

  function restoreText(
    composerSnapshot: ComposerSnapshot,
    expectedText: string,
    restoredText = composerSnapshot.text,
  ) {
    const composer = targetComposer(composerSnapshot);
    if (!composer || !isCurrent(composerSnapshot, expectedText)) {
      return false;
    }
    return writeText(composer, restoredText);
  }

  function targetComposer(composerSnapshot: ComposerSnapshot) {
    const target = targetBySnapshot.get(composerSnapshot);
    return target &&
      target.pathname === hostWindow.location.pathname &&
      current() === target.element
      ? target.element
      : null;
  }

  function isCurrent(composerSnapshot: ComposerSnapshot, expectedText: string) {
    const composer = targetComposer(composerSnapshot);
    return (
      composer !== null &&
      composerAccess.normalize(composerAccess.read(composer)) ===
        composerAccess.normalize(expectedText)
    );
  }

  return { current, isCurrent, replaceText, restoreText, snapshot };
}

export type ComposerDriver = ReturnType<typeof createComposerDriver>;
