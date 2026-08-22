import { readRenderedText } from "@/lib/rendered-text";

import { normalizeComposerText } from "./composer-access";
import type { HostEnvironment } from "./host-environment";
import type { ComposerAccess } from "./site-adapter";

export function pasteFirstDomFallbackComposer(
  selector: string,
  normalize: (text: string) => string = normalizeComposerText,
): ComposerAccess {
  return {
    normalize,
    read: readRenderedText,
    selector,
    write(composer, text, environment) {
      selectComposerContents(composer, environment);
      if (dispatchSyntheticPaste(composer, text)) {
        environment.logger?.("[QuoteCue host] composer paste replacement accepted");
        return true;
      }
      if (
        typeof environment.document.execCommand === "function" &&
        environment.document.execCommand("insertText", false, text)
      ) {
        // Managed editors may render an accepted command asynchronously; send confirmation still
        // validates the final user message against the complete replacement text.
        const isSynced = normalize(readRenderedText(composer)) === normalize(text);
        environment.logger?.(`[QuoteCue host] composer command replacement: synced=${isSynced}`);
        if (!isSynced) {
          logMismatch("command", composer, text, environment, normalize);
        }
        return true;
      }

      const paragraph = environment.document.createElement("p");
      paragraph.textContent = text;
      composer.replaceChildren(paragraph);
      composer.dispatchEvent(
        new InputEvent("input", { bubbles: true, data: text, inputType: "insertText" }),
      );
      const isReplaced = normalize(readRenderedText(composer)) === normalize(text);
      environment.logger?.(`[QuoteCue host] composer fallback replacement: matched=${isReplaced}`);
      if (!isReplaced) {
        logMismatch("fallback", composer, text, environment, normalize);
      }
      return isReplaced;
    },
  };
}

function selectComposerContents(composer: HTMLElement, environment: HostEnvironment) {
  const selection = environment.window.getSelection();
  const range = environment.document.createRange();
  range.selectNodeContents(composer);
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function dispatchSyntheticPaste(composer: HTMLElement, text: string) {
  if (typeof ClipboardEvent !== "function" || typeof DataTransfer !== "function") {
    return false;
  }
  const clipboardData = new DataTransfer();
  clipboardData.setData("text/plain", text);
  return !composer.dispatchEvent(
    new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData }),
  );
}

function logMismatch(
  stage: string,
  composer: HTMLElement,
  expectedText: string,
  environment: HostEnvironment,
  normalize: (text: string) => string,
) {
  if (!environment.logger) {
    return;
  }
  const actual = normalize(readRenderedText(composer));
  const expected = normalize(expectedText);
  const compact = (value: string) => value.replace(/\s/g, "");
  environment.logger(
    `[QuoteCue host] composer ${stage} mismatch: actual=${actual.length}, expected=${expected.length}, compact=${compact(actual) === compact(expected)}, contains=${actual.includes(expected)}, contained=${expected.includes(actual)}, nfkc=${actual.normalize("NFKC") === expected.normalize("NFKC")}`,
  );
}
