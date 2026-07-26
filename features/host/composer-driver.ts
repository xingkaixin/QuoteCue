import {
  available,
  unavailable,
  type ComposerSnapshot,
  type HostContext,
  type HostResult,
} from "./host-context";
import type { TextNormalizer } from "./text-normalizer";

export function createComposerDriver(context: HostContext, textNormalizer: TextNormalizer) {
  const { adapter, document: hostDocument, logger, window: hostWindow } = context;
  const { composerText, normalizedText } = textNormalizer;

  const current = () => hostDocument.querySelector<HTMLElement>(adapter.composerSelector);

  function snapshot(): HostResult<ComposerSnapshot> {
    const element = current();
    return element
      ? available({ element, text: composerText(element) })
      : unavailable("composer-unavailable");
  }

  function replaceText(composer: HTMLElement, text: string) {
    if (!composer.isConnected) {
      return false;
    }

    composer.focus();
    if (adapter.composerKind === "textarea" && composer instanceof HTMLTextAreaElement) {
      setNativeTextareaValue(composer, text);
      composer.dispatchEvent(
        new InputEvent("input", { bubbles: true, data: text, inputType: "insertText" }),
      );
      return composer.value === text;
    }

    selectComposerContents(composer);
    // 优先合成粘贴：富文本编辑器（Lexical/ProseMirror）对 paste 有完整处理，会接管事件
    // 并保留多行结构；execCommand("insertText") 在 Kimi 的 Lexical 上会触发原生与编辑器
    // 内部的双路插入（内容重复且丢失换行），只作为未接管粘贴时的降级
    if (dispatchSyntheticPaste(composer, text)) {
      logger?.("[QuoteCue host] composer paste replacement accepted");
      return true;
    }
    if (
      typeof hostDocument.execCommand === "function" &&
      hostDocument.execCommand("insertText", false, text)
    ) {
      // Lexical 类编辑器接受 beforeinput 后异步渲染 DOM，同步读回为空不代表插入失败；
      // 此处不因读回不匹配而中止（fallback 的 replaceChildren 反而会打乱编辑器内部状态），
      // 内容正确性由发送确认的全文强匹配兜底
      const isSynced = normalizedText(composer) === normalizedText(text);
      logger?.(`[QuoteCue host] composer command replacement: synced=${isSynced}`);
      if (!isSynced) {
        logMismatch("command", composer, text);
      }
      return true;
    }

    const paragraph = hostDocument.createElement("p");
    paragraph.textContent = text;
    composer.replaceChildren(paragraph);
    composer.dispatchEvent(
      new InputEvent("input", { bubbles: true, data: text, inputType: "insertText" }),
    );
    const isReplaced = normalizedText(composer) === normalizedText(text);
    logger?.(`[QuoteCue host] composer fallback replacement: matched=${isReplaced}`);
    if (!isReplaced) {
      logMismatch("fallback", composer, text);
    }
    return isReplaced;
  }

  function logMismatch(stage: string, composer: HTMLElement, expectedText: string) {
    if (!logger) {
      return;
    }
    const actual = normalizedText(composer);
    const expected = normalizedText(expectedText);
    const compact = (value: string) => value.replace(/\s/g, "");
    logger(
      `[QuoteCue host] composer ${stage} mismatch: actual=${actual.length}, expected=${expected.length}, compact=${compact(actual) === compact(expected)}, contains=${actual.includes(expected)}, contained=${expected.includes(actual)}, nfkc=${actual.normalize("NFKC") === expected.normalize("NFKC")}`,
    );
  }

  function restoreText(composerSnapshot: ComposerSnapshot, expectedText: string) {
    if (
      current() !== composerSnapshot.element ||
      normalizedText(composerSnapshot.element) !== normalizedText(expectedText)
    ) {
      return false;
    }
    return replaceText(composerSnapshot.element, composerSnapshot.text);
  }

  function selectComposerContents(composer: HTMLElement) {
    const selection = hostWindow.getSelection();
    const range = hostDocument.createRange();
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

  return { current, replaceText, restoreText, snapshot };
}

// 编辑器 preventDefault 即表示接管了粘贴；返回 false 交由调用方降级
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

export type ComposerDriver = ReturnType<typeof createComposerDriver>;
