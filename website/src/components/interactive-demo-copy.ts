import type { DemoCopy } from "../i18n/content";

export function formatDemoAnnotationCount(copy: DemoCopy, count: number): string {
  return selectCountTemplate(copy.annotationCount, count).replace("{count}", String(count));
}

export function formatDemoRemovedNotice(
  copy: DemoCopy,
  removed: number,
  remaining: number,
): string {
  return selectCountTemplate(copy.removedNotice, removed)
    .replace("{removed}", String(removed))
    .replace("{remaining}", String(remaining));
}

function selectCountTemplate(copy: DemoCopy["annotationCount"], count: number): string {
  return count === 1 ? copy.one : copy.other;
}
