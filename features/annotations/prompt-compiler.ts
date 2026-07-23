import { selectedTextFor, type DraftAnnotation } from "./annotation";
import { messagesFor, type SupportedLocale } from "@/features/i18n/messages";

export function compileAnnotatedPrompt(
  annotations: DraftAnnotation[],
  userPrompt: string,
  locale: SupportedLocale = "zh-CN",
) {
  const messages = messagesFor(locale).prompt;
  const annotationSections = annotations.map(({ anchor, comment }, index) => {
    const commentLine = comment ? `\n${messages.comment}${comment}` : "";
    return `${messages.annotation(index + 1)}\n${messages.selectedText}${selectedTextFor(anchor)}${commentLine}`;
  });
  const trimmedPrompt = userPrompt.trim();
  const promptSection =
    trimmedPrompt.length > 0 ? `${messages.supplementalQuestion}\n${trimmedPrompt}` : "";

  return [messages.introduction, ...annotationSections, promptSection].filter(Boolean).join("\n\n");
}
