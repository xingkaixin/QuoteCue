import {
  available,
  unavailable,
  type ComposerSnapshot,
  type HostContext,
  type HostResult,
} from "./host-context";
import type { TextNormalizer } from "./text-normalizer";

export function createComposerDriver(context: HostContext, textNormalizer: TextNormalizer) {
  const { adapter, document: hostDocument, logger } = context;
  const { composerText, normalize, normalizedComposerText } = textNormalizer;

  const current = () => hostDocument.querySelector<HTMLElement>(adapter.composer.selector);

  function snapshot(): HostResult<ComposerSnapshot> {
    const element = current();
    return element
      ? available({ element, text: composerText(element) })
      : unavailable("composer-unavailable", logger);
  }

  function replaceText(composer: HTMLElement, text: string) {
    if (!composer.isConnected) {
      return false;
    }

    composer.focus();
    return adapter.composer.write(composer, text, context);
  }

  function restoreText(composerSnapshot: ComposerSnapshot, expectedText: string) {
    if (
      current() !== composerSnapshot.element ||
      normalizedComposerText(composerSnapshot.element) !== normalize(expectedText)
    ) {
      return false;
    }
    return replaceText(composerSnapshot.element, composerSnapshot.text);
  }

  return { current, replaceText, restoreText, snapshot };
}

export type ComposerDriver = ReturnType<typeof createComposerDriver>;
