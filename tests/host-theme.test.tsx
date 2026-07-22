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
  document.documentElement.removeAttribute("data-theme");
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("host theme", () => {
  it("prefers explicit host state and falls back to system preference", () => {
    const html = document.createElement("html");
    expect(detectHostTheme(html, null, true)).toBe("dark");
    html.dataset.theme = "light";
    expect(detectHostTheme(html, null, true)).toBe("light");
    html.removeAttribute("data-theme");
    html.classList.add("dark");
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
      document.documentElement.dataset.theme = "dark";
      await Promise.resolve();
    });
    expect(container.textContent).toBe("dark");
    expect(themeContainer.dataset.quotecueTheme).toBe("dark");
    expect(themeContainer.style.getPropertyValue("--qc-surface")).toBe(
      HOST_THEME_TOKENS.dark.surface,
    );
    expect(themeContainer.style.getPropertyValue("--qc-accent")).toBe(
      "var(--theme-submit-btn-bg, #2563eb)",
    );
    expect(themeContainer.style.getPropertyValue("--qc-accent-subtle")).toBe(
      "var(--theme-secondary-btn-bg, #2563eb)",
    );

    await act(async () => root.unmount());
  });
});

function ThemeProbe() {
  return useHostTheme();
}
