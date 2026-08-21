export const QUOTECUE_HOST_ATTR = "data-quotecue-host";
export const QUOTECUE_INTERACTIVE_CLASS = "quotecue-interactive";
export const QUOTECUE_NATIVE_ACTION_ATTR = "data-quotecue-native-action";
export const QUOTECUE_ROOT_ATTR = "data-quotecue-root";

export const QUOTECUE_HOST_SELECTOR = `[${QUOTECUE_HOST_ATTR}]`;
export const QUOTECUE_NATIVE_ACTION_SELECTOR = `[${QUOTECUE_NATIVE_ACTION_ATTR}]`;
export const QUOTECUE_ROOT_SELECTOR = `[${QUOTECUE_ROOT_ATTR}]`;
export const QUOTECUE_BOUNDARY_SELECTOR = [
  QUOTECUE_HOST_SELECTOR,
  QUOTECUE_NATIVE_ACTION_SELECTOR,
  QUOTECUE_ROOT_SELECTOR,
].join(", ");

export function isQuoteCueEvent(event: Event) {
  return event
    .composedPath()
    .some((target) => target instanceof Element && target.matches(QUOTECUE_BOUNDARY_SELECTOR));
}

// Floating and tooltip layers only order QuoteCue UI inside the base stacking context.
// Host overlays above the base layer can still obscure QuoteCue UI.
export const Z_LAYER = {
  base: 40,
  floating: 2_147_483_646,
  tooltip: 2_147_483_647,
} as const;
