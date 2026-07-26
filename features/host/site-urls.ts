export const SITE_URLS = {
  chatgpt: {
    hostname: "chatgpt.com",
    urlPattern: "https://chatgpt.com/*",
  },
  deepseek: {
    hostname: "chat.deepseek.com",
    urlPattern: "https://chat.deepseek.com/*",
  },
  claude: {
    hostname: "claude.ai",
    urlPattern: "https://claude.ai/*",
  },
  kimi: {
    hostname: "www.kimi.com",
    urlPattern: "https://www.kimi.com/*",
  },
} as const;

export const SITE_URL_PATTERNS = Object.values(SITE_URLS).map(({ urlPattern }) => urlPattern);

export type SiteUrl = (typeof SITE_URLS)[keyof typeof SITE_URLS];
