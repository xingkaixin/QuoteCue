import type { ComposerAccess } from "./site-adapter";

export const normalizeComposerText = (text: string) => text.replace(/\s+/g, " ").trim();

export function textareaComposer(selector: string): ComposerAccess {
  return {
    normalize: normalizeComposerText,
    read(composer) {
      return composer instanceof HTMLTextAreaElement ? composer.value : "";
    },
    selector,
    write(composer, text) {
      if (!(composer instanceof HTMLTextAreaElement)) {
        return false;
      }
      setNativeTextareaValue(composer, text);
      composer.dispatchEvent(
        new InputEvent("input", { bubbles: true, data: text, inputType: "insertText" }),
      );
      return composer.value === text;
    },
  };
}

function setNativeTextareaValue(composer: HTMLTextAreaElement, text: string) {
  // React 受控 textarea 会忽略直接赋值，必须走原生 setter 再派发 input 事件
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  if (setter) {
    setter.call(composer, text);
  } else {
    composer.value = text;
  }
}
