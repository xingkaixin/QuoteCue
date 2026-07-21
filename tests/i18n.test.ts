import { describe, expect, it } from "vitest";

import { messagesFor, resolveLocale } from "@/features/i18n/messages";

describe("i18n", () => {
  it("prefers the first supported language tag", () => {
    expect(resolveLocale(["zh-Hant", "en-US"])).toBe("zh-TW");
    expect(resolveLocale(["fr-FR", "zh-Hans"])).toBe("zh-CN");
    expect(resolveLocale(["en-GB", "zh-CN"])).toBe("en");
  });

  it("falls back to English for unsupported languages", () => {
    expect(resolveLocale(["fr-FR"])).toBe("en");
    expect(messagesFor("en").annotationCount(2)).toBe("2 annotations");
  });
});
