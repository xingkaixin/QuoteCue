const QUOTECUE_BOUNDARY_SELECTOR =
  "[data-quotecue-host], [data-quotecue-native-action], [data-quotecue-root]";

export function isQuoteCueEvent(event: Event) {
  return event
    .composedPath()
    .some((target) => target instanceof Element && target.matches(QUOTECUE_BOUNDARY_SELECTOR));
}
