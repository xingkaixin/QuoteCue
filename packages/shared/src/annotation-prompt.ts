export type AnnotationPromptEntry = {
  comment: string;
  ordinal: number;
  selectedText: string;
};

export type AnnotationPromptMessages = {
  annotation(number: number): string;
  comment: string;
  introduction: string;
  selectedText: string;
  supplementalQuestion: string;
};

export function compileAnnotationPrompt(
  annotations: readonly AnnotationPromptEntry[],
  userPrompt: string,
  messages: AnnotationPromptMessages,
) {
  const annotationSections = annotations.map(({ comment, ordinal, selectedText }) => {
    const commentLine = comment ? `\n${messages.comment}${comment}` : "";
    return `${messages.annotation(ordinal)}\n${messages.selectedText}${selectedText}${commentLine}`;
  });
  const trimmedPrompt = userPrompt.trim();
  const supplementalQuestionSection =
    trimmedPrompt.length > 0 ? `${messages.supplementalQuestion}\n${trimmedPrompt}` : "";

  return [messages.introduction, ...annotationSections, supplementalQuestionSection]
    .filter(Boolean)
    .join("\n\n");
}
