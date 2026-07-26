export const QUOTECUE_HOST_ATTR = "data-quotecue-host";
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

// Host pages may create arbitrary stacking contexts, so floating UI reserves the top two layers.
export const Z_LAYER = {
  base: 40,
  floating: 2_147_483_646,
  tooltip: 2_147_483_647,
} as const;
