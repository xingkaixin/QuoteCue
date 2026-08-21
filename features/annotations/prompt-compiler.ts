import { messagesFor, type SupportedLocale } from "@/features/i18n/messages";
import { selectedTextFor } from "@/features/host-port/text-anchor";
import { compileAnnotationPrompt } from "@/lib/annotation-prompt";

import type { NumberedAnnotation } from "./annotation-projection";

export function compileAnnotatedPrompt(
  annotations: readonly NumberedAnnotation[],
  userPrompt: string,
  locale: SupportedLocale = "zh-CN",
) {
  const messages = messagesFor(locale).prompt;
  return compileAnnotationPrompt(
    annotations.map(({ annotation, ordinal }) => ({
      comment: annotation.comment,
      ordinal,
      selectedText: selectedTextFor(annotation.anchor),
    })),
    userPrompt,
    messages,
  );
}
