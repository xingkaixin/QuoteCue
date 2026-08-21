import { compileAnnotationPrompt } from "../../../lib/annotation-prompt";

import type { DemoCopy } from "../i18n/content";

import type { DemoAnnotation } from "./interactive-demo-state";

export function compileDemoPrompt(annotations: readonly DemoAnnotation[], copy: DemoCopy) {
  const prompt = copy.compiledPrompt;
  return compileAnnotationPrompt(
    annotations.map((annotation, index) => ({
      comment: annotation.comment,
      ordinal: index + 1,
      selectedText: annotation.text,
    })),
    "",
    {
      annotation: (number) => `[${prompt.annotation} ${number}]`,
      comment: prompt.comment,
      introduction: prompt.intro,
      selectedText: prompt.selection,
      supplementalQuestion: prompt.supplementalQuestion,
    },
  );
}
