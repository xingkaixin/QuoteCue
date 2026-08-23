export type HostEnvironment = {
  document: Document;
  logger?: (message: string, error?: unknown) => void;
  window: Window;
};
