export type HostEnvironment = {
  document: Document;
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- Errors crossing this boundary may contain arbitrary values.
  logger?: (message: string, error?: unknown) => void;
  window: Window;
};
