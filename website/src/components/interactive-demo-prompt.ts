import { compileAnnotationPrompt } from "@quotecue/shared/annotation-prompt";
import { annotationPromptMessagesFor } from "@quotecue/shared/annotation-prompt-messages";

import type { DemoCopy } from "../i18n/content";

import type { DemoAnnotation } from "./interactive-demo-state";

export function compileDemoPrompt(annotations: readonly DemoAnnotation[], copy: DemoCopy) {
  return compileAnnotationPrompt(
    annotations.map((annotation, index) => ({
      comment: annotation.comment,
      ordinal: index + 1,
      selectedText: annotation.anchor.quote,
    })),
    "",
    annotationPromptMessagesFor(copy.locale),
  );
}
