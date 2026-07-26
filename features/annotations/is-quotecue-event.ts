import { QUOTECUE_BOUNDARY_SELECTOR } from "@/lib/dom-identity";

export function isQuoteCueEvent(event: Event) {
  return event
    .composedPath()
    .some((target) => target instanceof Element && target.matches(QUOTECUE_BOUNDARY_SELECTOR));
}
