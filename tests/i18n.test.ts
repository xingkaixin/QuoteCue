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

  it("localizes destructive action status", () => {
    expect(messagesFor("zh-CN").annotationRemoved(2, 1)).toBe("已删除 2 条批注，还剩 1 条。");
  });

  it("localizes the owned selection action", () => {
    expect(messagesFor("en").addAnnotation).toBe("Add QuoteCue annotation");
    expect(messagesFor("zh-CN").addAnnotation).toBe("添加 QuoteCue 批注");
    expect(messagesFor("zh-TW").addAnnotation).toBe("新增 QuoteCue 批註");
  });
});
