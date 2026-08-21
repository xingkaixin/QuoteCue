import { readRenderedText } from "@/lib/rendered-text";

import type { HostEnvironment } from "./host-environment";
import type { ComposerAccess } from "./site-adapter";

const normalizeWhitespace = (text: string) => text.replace(/\s+/g, " ").trim();

export function richTextComposer(
  selector: string,
  normalize: (text: string) => string = normalizeWhitespace,
): ComposerAccess {
  return {
    normalize,
    read: readRenderedText,
    selector,
    write(composer, text, environment) {
      selectComposerContents(composer, environment);
      // 优先合成粘贴：富文本编辑器（Lexical/ProseMirror）对 paste 有完整处理，会接管事件
      // 并保留多行结构；execCommand("insertText") 在 Kimi 的 Lexical 上会触发原生与编辑器
      // 内部的双路插入（内容重复且丢失换行），只作为未接管粘贴时的降级
      if (dispatchSyntheticPaste(composer, text)) {
        environment.logger?.("[QuoteCue host] composer paste replacement accepted");
        return true;
      }
      if (
        typeof environment.document.execCommand === "function" &&
        environment.document.execCommand("insertText", false, text)
      ) {
        // Lexical 类编辑器接受 beforeinput 后异步渲染 DOM，同步读回为空不代表插入失败；
        // 此处不因读回不匹配而中止（fallback 的 replaceChildren 反而会打乱编辑器内部状态），
        // 内容正确性由发送确认的全文强匹配兜底
        const isSynced = normalize(readRenderedText(composer)) === normalize(text);
        environment.logger?.(`[QuoteCue host] composer command replacement: synced=${isSynced}`);
        if (!isSynced) {
          logMismatch("command", composer, text, environment, readRenderedText, normalize);
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
        logMismatch("fallback", composer, text, environment, readRenderedText, normalize);
      }
      return isReplaced;
    },
  };
}

export function textareaComposer(selector: string): ComposerAccess {
  return {
    normalize: normalizeWhitespace,
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

function selectComposerContents(composer: HTMLElement, environment: HostEnvironment) {
  const selection = environment.window.getSelection();
  const range = environment.document.createRange();
  range.selectNodeContents(composer);
  selection?.removeAllRanges();
  selection?.addRange(range);
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
  read: (composer: HTMLElement) => string,
  normalize: (text: string) => string,
) {
  if (!environment.logger) {
    return;
  }
  const actual = normalize(read(composer));
  const expected = normalize(expectedText);
  const compact = (value: string) => value.replace(/\s/g, "");
  environment.logger(
    `[QuoteCue host] composer ${stage} mismatch: actual=${actual.length}, expected=${expected.length}, compact=${compact(actual) === compact(expected)}, contains=${actual.includes(expected)}, contained=${expected.includes(actual)}, nfkc=${actual.normalize("NFKC") === expected.normalize("NFKC")}`,
  );
}
