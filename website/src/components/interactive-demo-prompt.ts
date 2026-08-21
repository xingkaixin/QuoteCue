import { compileAnnotationPrompt } from "../../../lib/annotation-prompt";
import { annotationPromptMessagesFor } from "../../../lib/annotation-prompt-messages";

import type { DemoCopy } from "../i18n/content";

import type { DemoAnnotation } from "./interactive-demo-state";

export function compileDemoPrompt(annotations: readonly DemoAnnotation[], copy: DemoCopy) {
  return compileAnnotationPrompt(
    annotations.map((annotation, index) => ({
      comment: annotation.comment,
      ordinal: index + 1,
      selectedText: annotation.text,
    })),
    "",
    annotationPromptMessagesFor(copy.locale),
  );
}
