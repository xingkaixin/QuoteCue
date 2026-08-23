import {
  available,
  unavailable,
  type ComposerSnapshot,
  type HostContext,
  type HostResult,
} from "./host-context";

export function createComposerDriver(context: HostContext) {
  const { adapter, document: hostDocument, logger } = context;
  const composerAccess = adapter.composer;
  const composerBySnapshot = new WeakMap<ComposerSnapshot, HTMLElement>();

  const current = () => hostDocument.querySelector<HTMLElement>(adapter.composer.selector);

  function snapshot(): HostResult<ComposerSnapshot> {
    const element = current();
    if (!element) {
      return unavailable("composer-unavailable", logger);
    }
    const value = { text: composerAccess.read(element) };
    composerBySnapshot.set(value, element);
    return available(value);
  }

  function replaceText(composerSnapshot: ComposerSnapshot, text: string) {
    const composer = composerBySnapshot.get(composerSnapshot);
    return composer ? writeText(composer, text) : false;
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
