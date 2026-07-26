import { messagesFor, type SupportedLocale } from "@/features/i18n/messages";

import { selectedTextFor } from "./annotation";
import type { NumberedAnnotation } from "./annotation-projection";

export function compileAnnotatedPrompt(
  annotations: readonly NumberedAnnotation[],
  userPrompt: string,
  locale: SupportedLocale = "zh-CN",
) {
  const messages = messagesFor(locale).prompt;
  const annotationSections = annotations.map(({ annotation, ordinal }) => {
    const { anchor, comment } = annotation;
    const commentLine = comment ? `\n${messages.comment}${comment}` : "";
    return `${messages.annotation(ordinal)}\n${messages.selectedText}${selectedTextFor(anchor)}${commentLine}`;
  });
  const trimmedPrompt = userPrompt.trim();
  const promptSection =
    trimmedPrompt.length > 0 ? `${messages.supplementalQuestion}\n${trimmedPrompt}` : "";

  return [messages.introduction, ...annotationSections, promptSection].filter(Boolean).join("\n\n");
}
