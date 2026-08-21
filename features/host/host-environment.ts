export type HostEnvironment = {
  document: Document;
  logger?: (message: string) => void;
  window: Window;
};
