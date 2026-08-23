export const SUPPORTED_SITES = [
  {
    id: "chatgpt",
    name: "ChatGPT",
    hostname: "chatgpt.com",
    urlPattern: "https://chatgpt.com/*",
  },
  {
    id: "claude",
    name: "Claude",
    hostname: "claude.ai",
    urlPattern: "https://claude.ai/*",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    hostname: "chat.deepseek.com",
    urlPattern: "https://chat.deepseek.com/*",
  },
  {
    id: "kimi",
    name: "Kimi",
    hostname: "www.kimi.com",
    urlPattern: "https://www.kimi.com/*",
  },
] as const;

export type SupportedSite = (typeof SUPPORTED_SITES)[number];
export type SupportedSiteId = SupportedSite["id"];
export type SupportedSiteName = SupportedSite["name"];

export function isSupportedSiteId(value: unknown): value is SupportedSiteId {
  return SUPPORTED_SITES.some(({ id }) => id === value);
}
