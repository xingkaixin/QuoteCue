import type { ComposerSnapshot, HostResult } from "@/features/host-port/host-port";

import type { HostContext } from "./host-context";
import { available, unavailable } from "./host-result";

const COMPOSER_REPLACEMENT_TIMEOUT_MS = 2_000;

export function createComposerDriver(context: HostContext) {
  const { adapter, document: hostDocument, logger, window: hostWindow } = context;
  const composerAccess = adapter.composer;
  const composerBySnapshot = new WeakMap<ComposerSnapshot, HTMLElement>();

  const current = () => hostDocument.querySelector<HTMLElement>(adapter.composer.selector);

  function snapshot(): HostResult<ComposerSnapshot> {
    const element = current();
    if (!element) {
      return unavailable("composer-unavailable", logger);
    }
    const value = { text: composerAccess.read(element) } as ComposerSnapshot;
    composerBySnapshot.set(value, element);
    return available(value);
  }

  function replaceText(composerSnapshot: ComposerSnapshot, text: string, signal: AbortSignal) {
    const composer = composerBySnapshot.get(composerSnapshot);
    if (!composer || !writeText(composer, text)) {
      return Promise.resolve(false);
    }
    return waitForText(composer, text, signal);
  }

  function waitForText(replacedComposer: HTMLElement, text: string, signal: AbortSignal) {
    const expectedText = composerAccess.normalize(text);
    const matches = () => {
      const composer = current();
      return (
        composer !== null &&
        composerAccess.normalize(composerAccess.read(composer)) === expectedText
      );
    };
    if (matches()) {
      return Promise.resolve(true);
    }
    if (signal.aborted) {
      return Promise.resolve(false);
    }

    logger?.("[QuoteCue host] composer replacement waiting for render");
    return new Promise<boolean>((resolve) => {
      let timeout: number | undefined;
      const observer = new MutationObserver(() => {
        if (matches()) {
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
      observer.observe(replacedComposer.parentElement ?? replacedComposer, {
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
    const composer = composerBySnapshot.get(composerSnapshot);
    if (
      !composer ||
      current() !== composer ||
      composerAccess.normalize(composerAccess.read(composer)) !==
        composerAccess.normalize(expectedText)
    ) {
      return false;
    }
    return writeText(composer, restoredText);
  }

  return { current, replaceText, restoreText, snapshot };
}

export type ComposerDriver = ReturnType<typeof createComposerDriver>;
