export type SupportedLocale = "en" | "zh-CN" | "zh-TW";

export type Messages = {
  annotation: (number: number) => string;
  annotationCount: (count: number) => string;
  annotationContent: string;
  cancel: string;
  clearAnnotations: string;
  deleteAnnotation: string;
  deleteNumberedAnnotation: (number: number) => string;
  editNumberedAnnotation: (number: number) => string;
  loadDraftFailed: string;
  loadingDraft: string;
  noComment: string;
  optionalComment: string;
  save: string;
  saveAnnotation: string;
  saveDraftFailed: string;
  selectedText: string;
  sendAnnotations: string;
  retry: string;
  retrySendingAnnotations: string;
  sendAnnotationsFailed: string;
  sendingAnnotations: string;
  userComment: string;
  viewAnnotation: (number: number) => string;
  prompt: {
    annotation: (number: number) => string;
    comment: string;
    introduction: string;
    selectedText: string;
    supplementalQuestion: string;
  };
};

const ENGLISH: Messages = {
  annotation: (number) => `Annotation ${number}`,
  annotationCount: (count) => `${count} ${count === 1 ? "annotation" : "annotations"}`,
  annotationContent: "Annotation content",
  cancel: "Cancel",
  clearAnnotations: "Clear all annotations",
  deleteAnnotation: "Delete annotation",
  deleteNumberedAnnotation: (number) => `Delete annotation ${number}`,
  editNumberedAnnotation: (number) => `Edit annotation ${number}`,
  loadDraftFailed: "QuoteCue couldn't restore this draft.",
  loadingDraft: "Restoring QuoteCue draft…",
  noComment: "No comment added",
  optionalComment: "Add an optional comment…",
  save: "Save",
  saveAnnotation: "Save annotation",
  saveDraftFailed: "QuoteCue couldn't save these annotations.",
  selectedText: "Selected text:",
  sendAnnotations: "Send annotations",
  retry: "Retry",
  retrySendingAnnotations: "Retry sending annotations",
  sendAnnotationsFailed: "Sending wasn't confirmed. Your annotation draft was kept.",
  sendingAnnotations: "Sending annotations…",
  userComment: "User comment:",
  viewAnnotation: (number) => `View annotation ${number}`,
  prompt: {
    annotation: (number) => `[Annotation ${number}]`,
    comment: "My comment: ",
    introduction: "Please respond based on the following annotations:",
    selectedText: "Selected text: ",
    supplementalQuestion: "[Supplemental question]",
  },
};

const SIMPLIFIED_CHINESE: Messages = {
  annotation: (number) => `批注 ${number}`,
  annotationCount: (count) => `${count} 条批注`,
  annotationContent: "批注内容",
  cancel: "取消",
  clearAnnotations: "清空全部批注",
  deleteAnnotation: "删除批注",
  deleteNumberedAnnotation: (number) => `删除批注 ${number}`,
  editNumberedAnnotation: (number) => `编辑批注 ${number}`,
  loadDraftFailed: "QuoteCue 无法恢复这份草稿。",
  loadingDraft: "正在恢复 QuoteCue 草稿…",
  noComment: "未添加批注",
  optionalComment: "添加可选批注…",
  save: "保存",
  saveAnnotation: "保存批注",
  saveDraftFailed: "QuoteCue 无法保存这些批注。",
  selectedText: "选中文本：",
  sendAnnotations: "发送批注",
  retry: "重试",
  retrySendingAnnotations: "重试发送批注",
  sendAnnotationsFailed: "未能确认发送，批注草稿仍已保留。",
  sendingAnnotations: "正在发送批注…",
  userComment: "用户批注：",
  viewAnnotation: (number) => `查看批注 ${number}`,
  prompt: {
    annotation: (number) => `[批注 ${number}]`,
    comment: "我的批注：",
    introduction: "请结合以下批注回答：",
    selectedText: "选中文本：",
    supplementalQuestion: "[补充问题]",
  },
};

const TRADITIONAL_CHINESE: Messages = {
  annotation: (number) => `批註 ${number}`,
  annotationCount: (count) => `${count} 條批註`,
  annotationContent: "批註內容",
  cancel: "取消",
  clearAnnotations: "清除全部批註",
  deleteAnnotation: "刪除批註",
  deleteNumberedAnnotation: (number) => `刪除批註 ${number}`,
  editNumberedAnnotation: (number) => `編輯批註 ${number}`,
  loadDraftFailed: "QuoteCue 無法復原這份草稿。",
  loadingDraft: "正在復原 QuoteCue 草稿…",
  noComment: "未新增批註",
  optionalComment: "新增選填批註…",
  save: "儲存",
  saveAnnotation: "儲存批註",
  saveDraftFailed: "QuoteCue 無法儲存這些批註。",
  selectedText: "選取文字：",
  sendAnnotations: "傳送批註",
  retry: "重試",
  retrySendingAnnotations: "重試傳送批註",
  sendAnnotationsFailed: "未能確認傳送，批註草稿仍已保留。",
  sendingAnnotations: "正在傳送批註…",
  userComment: "使用者批註：",
  viewAnnotation: (number) => `查看批註 ${number}`,
  prompt: {
    annotation: (number) => `[批註 ${number}]`,
    comment: "我的批註：",
    introduction: "請根據以下批註回答：",
    selectedText: "選取文字：",
    supplementalQuestion: "[補充問題]",
  },
};

const MESSAGES: Record<SupportedLocale, Messages> = {
  en: ENGLISH,
  "zh-CN": SIMPLIFIED_CHINESE,
  "zh-TW": TRADITIONAL_CHINESE,
};

export function messagesFor(locale: SupportedLocale) {
  return MESSAGES[locale];
}

export function resolveLocale(languageTags: Array<string | null | undefined>): SupportedLocale {
  for (const languageTag of languageTags) {
    const normalized = languageTag?.toLowerCase();
    if (!normalized) {
      continue;
    }
    if (normalized.startsWith("zh-hant") || normalized.startsWith("zh-tw")) {
      return "zh-TW";
    }
    if (normalized.startsWith("zh")) {
      return "zh-CN";
    }
    if (normalized.startsWith("en")) {
      return "en";
    }
  }

  return "en";
}
