import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  detectHostTheme,
  HOST_THEME_TOKENS,
  HostThemeProvider,
  useHostTheme,
} from "@/features/theme/HostThemeProvider";

afterEach(() => {
  document.documentElement.removeAttribute("class");
  document.documentElement.removeAttribute("data-mode");
  document.documentElement.removeAttribute("data-theme");
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("host theme", () => {
  it("inherits Kimi's host accent when earlier host tokens are absent", () => {
    expect(HOST_THEME_TOKENS.light.accent).toContain("--Colors-KMBlue");
    expect(HOST_THEME_TOKENS.dark["accent-subtle"]).toContain("--Colors-KMBlue");
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
        <HostThemeProvider container={themeContainer}>
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
      HOST_THEME_TOKENS.dark.surface,
    );
    expect(themeContainer.style.getPropertyValue("--qc-accent")).toBe(
      HOST_THEME_TOKENS.dark.accent,
    );
    expect(themeContainer.style.getPropertyValue("--qc-accent-subtle")).toBe(
      HOST_THEME_TOKENS.dark["accent-subtle"],
    );

    await act(async () => root.unmount());
  });
});

function ThemeProbe() {
  return useHostTheme();
}
