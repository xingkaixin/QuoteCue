import type { ComposerAccess } from "./host-context";

export function createTextNormalizer(composer: ComposerAccess) {
  return {
    composerText: composer.read,
    normalize: composer.normalize,
    normalizedComposerText(element: HTMLElement) {
      return composer.normalize(composer.read(element));
    },
    // 宿主会重排段落间换行；折叠后仍做全文强匹配，避免放松发送确认语义
    normalizedRenderedText(value: HTMLElement | string) {
      const text = typeof value === "string" ? value : renderedText(value);
      return composer.normalize(text);
    },
  };
}

export type TextNormalizer = ReturnType<typeof createTextNormalizer>;

function renderedText(element: HTMLElement) {
  return typeof element.innerText === "string" ? element.innerText : (element.textContent ?? "");
}
