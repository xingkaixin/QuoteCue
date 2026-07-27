import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  detectHostTheme,
  hostThemeTokens,
  HostThemeProvider,
  useHostTheme,
} from "@/features/theme/HostThemeProvider";
import { siteForHostname } from "@/features/host/site-registry";

const KIMI_ACCENT_TOKENS = requiredSite("www.kimi.com").accentTokens;
const KIMI_THEME_TOKENS = hostThemeTokens(KIMI_ACCENT_TOKENS);

afterEach(() => {
  document.documentElement.removeAttribute("class");
  document.documentElement.removeAttribute("data-mode");
  document.documentElement.removeAttribute("data-theme");
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("host theme", () => {
  it("uses only Kimi's registered accent tokens", () => {
    expect(KIMI_THEME_TOKENS.light.accent).toContain("--Colors-KMBlue");
    expect(KIMI_THEME_TOKENS.dark["accent-subtle"]).toContain("--Colors-KMBlue");
    expect(KIMI_THEME_TOKENS.light.accent).not.toMatch(/--theme-|--dsw-|--cds-/);
  });

  it("prefers explicit host state and falls back to system preference", () => {
    const html = document.createElement("html");
    expect(detectHostTheme(html, null, true)).toBe("dark");
    html.dataset.theme = "light";
    expect(detectHostTheme(html, null, true)).toBe("light");
    html.removeAttribute("data-theme");
    html.classList.add("dark");
    expect(detectHostTheme(html, null, false)).toBe("dark");
    html.classList.remove("dark");
    html.dataset.theme = "claude";
    html.dataset.mode = "light";
    expect(detectHostTheme(html, null, true)).toBe("light");
    html.dataset.mode = "dark";
    expect(detectHostTheme(html, null, false)).toBe("dark");
  });

  it("updates the shared UI container when the host theme changes", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    vi.stubGlobal("matchMedia", () => ({
      addEventListener: vi.fn(),
      matches: false,
      removeEventListener: vi.fn(),
    }));
    const themeContainer = document.createElement("div");
    const container = document.createElement("div");
    document.body.append(themeContainer, container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <HostThemeProvider accentTokens={KIMI_ACCENT_TOKENS} container={themeContainer}>
          <ThemeProbe />
        </HostThemeProvider>,
      );
    });
    expect(container.textContent).toBe("light");
    expect(themeContainer.dataset.quotecueTheme).toBe("light");

    await act(async () => {
      document.documentElement.dataset.mode = "dark";
      await Promise.resolve();
    });
    expect(container.textContent).toBe("dark");
    expect(themeContainer.dataset.quotecueTheme).toBe("dark");
    expect(themeContainer.style.getPropertyValue("--qc-surface")).toBe(
      KIMI_THEME_TOKENS.dark.surface,
    );
    expect(themeContainer.style.getPropertyValue("--qc-accent")).toBe(
      KIMI_THEME_TOKENS.dark.accent,
    );
    expect(themeContainer.style.getPropertyValue("--qc-accent-subtle")).toBe(
      KIMI_THEME_TOKENS.dark["accent-subtle"],
    );
    expect(themeContainer.style.getPropertyValue("--qc-divider")).toBe(
      KIMI_THEME_TOKENS.dark.divider,
    );
    expect(themeContainer.style.getPropertyValue("--qc-shadow")).toBe(
      KIMI_THEME_TOKENS.dark.shadow,
    );

    await act(async () => root.unmount());
    expect(themeContainer.dataset.quotecueTheme).toBeUndefined();
    expect(themeContainer.style.getPropertyValue("--qc-divider")).toBe("");
    expect(themeContainer.style.getPropertyValue("--qc-shadow")).toBe("");
  });
});

function ThemeProbe() {
  return useHostTheme();
}

function requiredSite(hostname: string) {
  const site = siteForHostname(hostname);
  if (!site) {
    throw new Error(`Missing site registration for ${hostname}`);
  }
  return site;
}
