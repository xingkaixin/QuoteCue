import type { SiteAdapter } from "./host-context";

export function createTextNormalizer(adapter: SiteAdapter) {
  const composerText = (composer: HTMLElement) => {
    if (adapter.composerKind === "textarea" && composer instanceof HTMLTextAreaElement) {
      return composer.value;
    }
    return typeof composer.innerText === "string"
      ? composer.innerText
      : (composer.textContent ?? "");
  };

  return {
    composerText,
    // 宿主会重排段落间换行；折叠后仍做全文强匹配，避免放松发送确认语义
    normalizedText(value: HTMLElement | string) {
      const text = typeof value === "string" ? value : composerText(value);
      return adapter.normalizeSubmittedText?.(text) ?? text.replace(/\s+/g, " ").trim();
    },
  };
}

export type TextNormalizer = ReturnType<typeof createTextNormalizer>;
