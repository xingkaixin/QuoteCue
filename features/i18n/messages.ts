import {
  annotationPromptMessagesFor,
  type AnnotationPromptLocale,
} from "@quotecue/shared/annotation-prompt-messages";
import type { AnnotationPromptMessages } from "@quotecue/shared/annotation-prompt";

export type SupportedLocale = AnnotationPromptLocale;

export type Messages = {
  addAnnotation: string;
  annotation: (number: number) => string;
  annotationCount: (count: number) => string;
  annotationContent: string;
  annotationRemoved: (removed: number, remaining: number) => string;
  annotationSourceUnavailable: string;
  cancel: string;
  clearAnnotations: string;
  clearAnnotationsConfirmation: string;
  confirmClearAnnotations: string;
  deleteAnnotation: string;
  deleteNumberedAnnotation: (number: number) => string;
  draftCapacityExceeded: string;
  editNumberedAnnotation: (number: number) => string;
  loadDraftFailed: string;
  loadingDraft: string;
  optionalComment: string;
  save: string;
  saveAnnotation: string;
  saveDraftFailed: string;
  selectedText: string;
  sendAnnotations: string;
  retry: string;
  retrySendingAnnotations: string;
  sendAnnotationsComposerUnavailable: string;
  sendAnnotationsConfirmationTimedOut: string;
  sendAnnotationsFailed: string;
  sendAnnotationsPromptTooLong: string;
  sendingAnnotations: string;
  undo: string;
  userComment: string;
  viewAnnotation: (number: number) => string;
  prompt: AnnotationPromptMessages;
};

const ENGLISH: Messages = {
  addAnnotation: "Add QuoteCue annotation",
  annotation: (number) => `Annotation ${number}`,
  annotationCount: (count) => `${count} ${count === 1 ? "annotation" : "annotations"}`,
  annotationContent: "Annotation content",
  annotationRemoved: (removed, remaining) =>
    `${removed === 1 ? "Annotation" : `${removed} annotations`} removed. ${remaining} remaining.`,
  annotationSourceUnavailable: "Source position changed",
  cancel: "Cancel",
  clearAnnotations: "Clear all annotations",
  clearAnnotationsConfirmation: "Clear all annotations? Click again to confirm.",
  confirmClearAnnotations: "Confirm clearing all annotations",
  deleteAnnotation: "Delete annotation",
  deleteNumberedAnnotation: (number) => `Delete annotation ${number}`,
  draftCapacityExceeded: "This draft is full. Shorten or remove annotations to continue.",
  editNumberedAnnotation: (number) => `Edit annotation ${number}`,
  loadDraftFailed: "QuoteCue couldn't restore this draft.",
  loadingDraft: "Restoring QuoteCue draft…",
  optionalComment: "Add an optional comment…",
  save: "Save",
  saveAnnotation: "Save annotation",
  saveDraftFailed: "QuoteCue couldn't save these annotations.",
  selectedText: "Selected text:",
  sendAnnotations: "Send annotations",
  retry: "Retry",
  retrySendingAnnotations: "Retry sending annotations",
  sendAnnotationsComposerUnavailable:
    "QuoteCue couldn't access the message box. Your annotation draft was kept.",
  sendAnnotationsConfirmationTimedOut:
    "Sending wasn't confirmed in time. Your annotation draft was kept.",
  sendAnnotationsFailed: "Sending wasn't confirmed. Your annotation draft was kept.",
  sendAnnotationsPromptTooLong:
    "This follow-up is too long to send. Shorten or remove annotations and try again.",
  sendingAnnotations: "Sending annotations…",
  undo: "Undo",
  userComment: "User comment:",
  viewAnnotation: (number) => `View annotation ${number}`,
  prompt: annotationPromptMessagesFor("en"),
};

const JAPANESE: Messages = {
  addAnnotation: "QuoteCue 注釈を追加",
  annotation: (number) => `注釈 ${number}`,
  annotationCount: (count) => `${count} 件の注釈`,
  annotationContent: "注釈の内容",
  annotationRemoved: (removed, remaining) =>
    `${removed} 件の注釈を削除しました。残り ${remaining} 件です。`,
  annotationSourceUnavailable: "引用元の位置が変更されました",
  cancel: "キャンセル",
  clearAnnotations: "すべての注釈を削除",
  clearAnnotationsConfirmation:
    "すべての注釈を削除しますか？もう一度クリックして確定してください。",
  confirmClearAnnotations: "すべての注釈の削除を確定",
  deleteAnnotation: "注釈を削除",
  deleteNumberedAnnotation: (number) => `注釈 ${number} を削除`,
  draftCapacityExceeded: "この下書きは上限に達しました。注釈を短くするか削除して続けてください。",
  editNumberedAnnotation: (number) => `注釈 ${number} を編集`,
  loadDraftFailed: "QuoteCue でこの下書きを復元できませんでした。",
  loadingDraft: "QuoteCue の下書きを復元しています…",
  optionalComment: "任意のコメントを追加…",
  save: "保存",
  saveAnnotation: "注釈を保存",
  saveDraftFailed: "QuoteCue で注釈を保存できませんでした。",
  selectedText: "選択したテキスト：",
  sendAnnotations: "注釈を送信",
  retry: "再試行",
  retrySendingAnnotations: "注釈の送信を再試行",
  sendAnnotationsComposerUnavailable:
    "QuoteCue がメッセージ入力欄にアクセスできませんでした。注釈の下書きは保持されています。",
  sendAnnotationsConfirmationTimedOut:
    "時間内に送信を確認できませんでした。注釈の下書きは保持されています。",
  sendAnnotationsFailed: "送信を確認できませんでした。注釈の下書きは保持されています。",
  sendAnnotationsPromptTooLong:
    "このフォローアップは長すぎて送信できません。注釈を短くするか削除して、もう一度お試しください。",
  sendingAnnotations: "注釈を送信しています…",
  undo: "元に戻す",
  userComment: "コメント：",
  viewAnnotation: (number) => `注釈 ${number} を表示`,
  prompt: annotationPromptMessagesFor("ja"),
};

const SIMPLIFIED_CHINESE: Messages = {
  addAnnotation: "添加 QuoteCue 批注",
  annotation: (number) => `批注 ${number}`,
  annotationCount: (count) => `${count} 条批注`,
  annotationContent: "批注内容",
  annotationRemoved: (removed, remaining) => `已删除 ${removed} 条批注，还剩 ${remaining} 条。`,
  annotationSourceUnavailable: "原文位置已变化",
  cancel: "取消",
  clearAnnotations: "清空全部批注",
  clearAnnotationsConfirmation: "要清空全部批注吗？请再次点击确认。",
  confirmClearAnnotations: "确认清空全部批注",
  deleteAnnotation: "删除批注",
  deleteNumberedAnnotation: (number) => `删除批注 ${number}`,
  draftCapacityExceeded: "这份草稿已满，请缩短或删除批注后继续。",
  editNumberedAnnotation: (number) => `编辑批注 ${number}`,
  loadDraftFailed: "QuoteCue 无法恢复这份草稿。",
  loadingDraft: "正在恢复 QuoteCue 草稿…",
  optionalComment: "添加可选批注…",
  save: "保存",
  saveAnnotation: "保存批注",
  saveDraftFailed: "QuoteCue 无法保存这些批注。",
  selectedText: "选中文本：",
  sendAnnotations: "发送批注",
  retry: "重试",
  retrySendingAnnotations: "重试发送批注",
  sendAnnotationsComposerUnavailable: "QuoteCue 无法访问消息输入框，批注草稿仍已保留。",
  sendAnnotationsConfirmationTimedOut: "未能及时确认发送，批注草稿仍已保留。",
  sendAnnotationsFailed: "未能确认发送，批注草稿仍已保留。",
  sendAnnotationsPromptTooLong: "这次追问内容过长，请缩短或删除批注后重试。",
  sendingAnnotations: "正在发送批注…",
  undo: "撤销",
  userComment: "用户批注：",
  viewAnnotation: (number) => `查看批注 ${number}`,
  prompt: annotationPromptMessagesFor("zh-CN"),
};

const TRADITIONAL_CHINESE: Messages = {
  addAnnotation: "新增 QuoteCue 批註",
  annotation: (number) => `批註 ${number}`,
  annotationCount: (count) => `${count} 條批註`,
  annotationContent: "批註內容",
  annotationRemoved: (removed, remaining) => `已刪除 ${removed} 條批註，還剩 ${remaining} 條。`,
  annotationSourceUnavailable: "原文位置已變更",
  cancel: "取消",
  clearAnnotations: "清除全部批註",
  clearAnnotationsConfirmation: "要清除全部批註嗎？請再次點擊確認。",
  confirmClearAnnotations: "確認清除全部批註",
  deleteAnnotation: "刪除批註",
  deleteNumberedAnnotation: (number) => `刪除批註 ${number}`,
  draftCapacityExceeded: "這份草稿已滿，請縮短或刪除批註後繼續。",
  editNumberedAnnotation: (number) => `編輯批註 ${number}`,
  loadDraftFailed: "QuoteCue 無法復原這份草稿。",
  loadingDraft: "正在復原 QuoteCue 草稿…",
  optionalComment: "新增選填批註…",
  save: "儲存",
  saveAnnotation: "儲存批註",
  saveDraftFailed: "QuoteCue 無法儲存這些批註。",
  selectedText: "選取文字：",
  sendAnnotations: "傳送批註",
  retry: "重試",
  retrySendingAnnotations: "重試傳送批註",
  sendAnnotationsComposerUnavailable: "QuoteCue 無法存取訊息輸入框，批註草稿仍已保留。",
  sendAnnotationsConfirmationTimedOut: "未能及時確認傳送，批註草稿仍已保留。",
  sendAnnotationsFailed: "未能確認傳送，批註草稿仍已保留。",
  sendAnnotationsPromptTooLong: "這次追問內容過長，請縮短或刪除批註後重試。",
  sendingAnnotations: "正在傳送批註…",
  undo: "復原",
  userComment: "使用者批註：",
  viewAnnotation: (number) => `查看批註 ${number}`,
  prompt: annotationPromptMessagesFor("zh-TW"),
};

const MESSAGES: Record<SupportedLocale, Messages> = {
  en: ENGLISH,
  ja: JAPANESE,
  "zh-CN": SIMPLIFIED_CHINESE,
  "zh-TW": TRADITIONAL_CHINESE,
};

export function messagesFor(locale: SupportedLocale) {
  return MESSAGES[locale];
}

export function resolveHostLocale(
  hostLanguageTag: string | null | undefined,
  browserLanguageTags: Array<string | null | undefined>,
): SupportedLocale {
  if (hostLanguageTag?.trim()) {
    return resolveLocale([hostLanguageTag]);
  }

  return resolveLocale(browserLanguageTags);
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
    if (normalized.startsWith("ja")) {
      return "ja";
    }
  }

  return "en";
}
