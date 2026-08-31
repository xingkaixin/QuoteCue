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
  annotationRemovedElsewhere: string;
  saveAsNewAnnotation: string;
  cancel: string;
  clearAnnotations: string;
  clearAnnotationsConfirmation: string;
  confirmClearAnnotations: string;
  deleteAnnotation: string;
  deleteNumberedAnnotation: (number: number) => string;
  draftCapacityExceeded: string;
  retainedDraft: (count: number) => string;
  retainedDraftSaveFailed: string;
  restoreRetainedDraft: string;
  discardRetainedDraft: string;
  confirmDiscardRetainedDraft: string;
  retrySavingDraft: string;
  editNumberedAnnotation: (number: number) => string;
  loadDraftFailed: string;
  loadingDraft: string;
  unreadableDraft: string;
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
  annotationRemovedElsewhere:
    "This annotation was removed elsewhere. Your edits are kept here; save them as a new annotation or cancel.",
  saveAsNewAnnotation: "Save as new annotation",
  cancel: "Cancel",
  clearAnnotations: "Clear all annotations",
  clearAnnotationsConfirmation: "Clear all annotations? Click again to confirm.",
  confirmClearAnnotations: "Confirm clearing all annotations",
  deleteAnnotation: "Delete annotation",
  deleteNumberedAnnotation: (number) => `Delete annotation ${number}`,
  draftCapacityExceeded: "This draft is full. Shorten or remove annotations to continue.",
  retainedDraft: (count) =>
    `${count} ${count === 1 ? "annotation was" : "annotations were"} kept from an unidentified conversation. They remain only in this page until restored or discarded; reloading loses them.`,
  retainedDraftSaveFailed:
    "Restoration couldn't be saved. Retry saving to the original destination before reloading this page.",
  restoreRetainedDraft: "Restore to this conversation",
  discardRetainedDraft: "Discard retained draft",
  confirmDiscardRetainedDraft: "Confirm discard",
  retrySavingDraft: "Retry saving",
  editNumberedAnnotation: (number) => `Edit annotation ${number}`,
  loadDraftFailed: "QuoteCue couldn't restore this draft.",
  loadingDraft: "Restoring QuoteCue draft…",
  unreadableDraft: "Some annotations cannot be read. Clear this draft to start again.",
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
  annotationRemovedElsewhere:
    "この注釈は別のページで削除されました。入力内容は保持されています。新しい注釈として保存するか、キャンセルしてください。",
  saveAsNewAnnotation: "新しい注釈として保存",
  cancel: "キャンセル",
  clearAnnotations: "すべての注釈を削除",
  clearAnnotationsConfirmation:
    "すべての注釈を削除しますか？もう一度クリックして確定してください。",
  confirmClearAnnotations: "すべての注釈の削除を確定",
  deleteAnnotation: "注釈を削除",
  deleteNumberedAnnotation: (number) => `注釈 ${number} を削除`,
  draftCapacityExceeded: "この下書きは上限に達しました。注釈を短くするか削除して続けてください。",
  retainedDraft: (count) =>
    `識別できない会話から ${count} 件の注釈を保持しています。この会話に復元するか破棄してください。ページを再読み込みすると失われます。`,
  retainedDraftSaveFailed:
    "復元内容を保存できませんでした。ページを再読み込みする前に、元の復元先への保存を再試行してください。",
  restoreRetainedDraft: "この会話に復元",
  discardRetainedDraft: "保持した下書きを破棄",
  confirmDiscardRetainedDraft: "破棄を確定",
  retrySavingDraft: "保存を再試行",
  editNumberedAnnotation: (number) => `注釈 ${number} を編集`,
  loadDraftFailed: "QuoteCue でこの下書きを復元できませんでした。",
  loadingDraft: "QuoteCue の下書きを復元しています…",
  unreadableDraft: "一部の注釈を読み込めません。下書きを削除してやり直してください。",
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
  annotationRemovedElsewhere: "这条批注已在其他页面移除。当前输入仍已保留，可另存为新批注或取消。",
  saveAsNewAnnotation: "另存为新批注",
  cancel: "取消",
  clearAnnotations: "清空全部批注",
  clearAnnotationsConfirmation: "要清空全部批注吗？请再次点击确认。",
  confirmClearAnnotations: "确认清空全部批注",
  deleteAnnotation: "删除批注",
  deleteNumberedAnnotation: (number) => `删除批注 ${number}`,
  draftCapacityExceeded: "这份草稿已满，请缩短或删除批注后继续。",
  retainedDraft: (count) =>
    `已保留未识别会话的 ${count} 条批注。仅在本页临时保留，刷新会丢失。可恢复到当前会话或丢弃。`,
  retainedDraftSaveFailed: "恢复内容保存失败，请在刷新页面前重试保存到原目标会话。",
  restoreRetainedDraft: "恢复到当前会话",
  discardRetainedDraft: "丢弃保留草稿",
  confirmDiscardRetainedDraft: "确认丢弃",
  retrySavingDraft: "重试保存",
  editNumberedAnnotation: (number) => `编辑批注 ${number}`,
  loadDraftFailed: "QuoteCue 无法恢复这份草稿。",
  loadingDraft: "正在恢复 QuoteCue 草稿…",
  unreadableDraft: "部分批注无法读取，可清空这份草稿后重新开始。",
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
  annotationRemovedElsewhere: "這條批註已在其他頁面移除。目前輸入仍已保留，可另存為新批註或取消。",
  saveAsNewAnnotation: "另存為新批註",
  cancel: "取消",
  clearAnnotations: "清除全部批註",
  clearAnnotationsConfirmation: "要清除全部批註嗎？請再次點擊確認。",
  confirmClearAnnotations: "確認清除全部批註",
  deleteAnnotation: "刪除批註",
  deleteNumberedAnnotation: (number) => `刪除批註 ${number}`,
  draftCapacityExceeded: "這份草稿已滿，請縮短或刪除批註後繼續。",
  retainedDraft: (count) =>
    `已保留未識別對話的 ${count} 條批註。僅在本頁暫時保留，重新整理會遺失。可復原到目前對話或捨棄。`,
  retainedDraftSaveFailed: "復原內容儲存失敗，請在重新整理頁面前重試儲存到原目標對話。",
  restoreRetainedDraft: "復原到目前對話",
  discardRetainedDraft: "捨棄保留草稿",
  confirmDiscardRetainedDraft: "確認捨棄",
  retrySavingDraft: "重試儲存",
  editNumberedAnnotation: (number) => `編輯批註 ${number}`,
  loadDraftFailed: "QuoteCue 無法復原這份草稿。",
  loadingDraft: "正在復原 QuoteCue 草稿…",
  unreadableDraft: "部分批註無法讀取，可清除這份草稿後重新開始。",
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
