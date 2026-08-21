import type { AnnotationPromptMessages } from "./annotation-prompt";

export type AnnotationPromptLocale = "en" | "zh-CN" | "zh-TW";

const PROMPT_MESSAGES = {
  en: {
    annotation: (number) => `[Annotation ${number}]`,
    comment: "My comment: ",
    introduction: "Please respond based on the following annotations:",
    selectedText: "Selected text: ",
    supplementalQuestion: "[Supplemental question]",
  },
  "zh-CN": {
    annotation: (number) => `[批注 ${number}]`,
    comment: "我的批注：",
    introduction: "请结合以下批注回答：",
    selectedText: "选中文本：",
    supplementalQuestion: "[补充问题]",
  },
  "zh-TW": {
    annotation: (number) => `[批註 ${number}]`,
    comment: "我的批註：",
    introduction: "請根據以下批註回答：",
    selectedText: "選取文字：",
    supplementalQuestion: "[補充問題]",
  },
} satisfies Record<AnnotationPromptLocale, AnnotationPromptMessages>;

export function annotationPromptMessagesFor(locale: AnnotationPromptLocale) {
  return PROMPT_MESSAGES[locale];
}
