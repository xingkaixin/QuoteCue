import { compileAnnotationPrompt } from "@quotecue/shared/annotation-prompt";
import { annotationPromptMessagesFor } from "@quotecue/shared/annotation-prompt-messages";

import type { Locale } from "../i18n/locales";

import type { DemoAnnotation } from "./interactive-demo-state";

export function compileDemoPrompt(annotations: readonly DemoAnnotation[], locale: Locale) {
  return compileAnnotationPrompt(
    annotations.map((annotation, index) => ({
      comment: annotation.comment,
      ordinal: index + 1,
      selectedText: annotation.anchor.quote,
    })),
    "",
    annotationPromptMessagesFor(locale),
  );
}
