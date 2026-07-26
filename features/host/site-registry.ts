import { createChatGptHost } from "@/features/chatgpt/chatgpt-host";
import { createClaudeHost } from "@/features/claude/claude-host";
import { createDeepSeekHost } from "@/features/deepseek/deepseek-host";
import { createKimiHost } from "@/features/kimi/kimi-host";
import type { Host } from "@/features/host-port/host-port";

import type { HostEnvironment } from "./dom-host";
import { SITE_URLS, type SiteUrl } from "./site-urls";

export type SiteAccentTokens = {
  accent: string;
  "accent-foreground": string;
  "accent-subtle": string;
  "accent-subtle-foreground": string;
  "accent-text": string;
};

export type SiteRegistration = SiteUrl & {
  accentTokens: SiteAccentTokens;
  createHost(environment: HostEnvironment): Host;
};

export const SITE_REGISTRY = [
  {
    ...SITE_URLS.chatgpt,
    accentTokens: {
      accent: "var(--theme-submit-btn-bg, #2563eb)",
      "accent-foreground": "var(--theme-submit-btn-text, #ffffff)",
      "accent-subtle": "var(--theme-secondary-btn-bg, #2563eb)",
      "accent-subtle-foreground": "var(--theme-secondary-btn-text, #ffffff)",
      "accent-text": "var(--theme-accent-text, #2563eb)",
    },
    createHost: createChatGptHost,
  },
  {
    ...SITE_URLS.deepseek,
    accentTokens: {
      accent: "var(--dsw-alias-brand-primary, #2563eb)",
      "accent-foreground": "#ffffff",
      "accent-subtle": "var(--dsw-alias-brand-primary, #2563eb)",
      "accent-subtle-foreground": "#ffffff",
      "accent-text": "var(--dsw-alias-brand-primary, #2563eb)",
    },
    createHost: createDeepSeekHost,
  },
  {
    ...SITE_URLS.claude,
    accentTokens: {
      accent: "var(--cds-fill-brand, #2563eb)",
      "accent-foreground": "var(--cds-on-brand, #ffffff)",
      "accent-subtle": "var(--cds-fill-brand, #2563eb)",
      "accent-subtle-foreground": "var(--cds-on-brand, #ffffff)",
      "accent-text": "var(--cds-fill-brand, #2563eb)",
    },
    createHost: createClaudeHost,
  },
  {
    ...SITE_URLS.kimi,
    accentTokens: {
      accent: "var(--Colors-KMBlue, #2563eb)",
      "accent-foreground": "#ffffff",
      "accent-subtle": "var(--Colors-KMBlue, #2563eb)",
      "accent-subtle-foreground": "#ffffff",
      "accent-text": "var(--Colors-KMBlue, #2563eb)",
    },
    createHost: createKimiHost,
  },
] satisfies readonly SiteRegistration[];

export function siteForHostname(hostname: string): SiteRegistration | null {
  return SITE_REGISTRY.find((site) => site.hostname === hostname) ?? null;
}
