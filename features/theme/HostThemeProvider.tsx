import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
} from "react";

import type { SiteAccentTokens } from "./accent-tokens";

export type HostTheme = "dark" | "light";

const HostThemeContext = createContext<HostTheme>("light");
const DARK_MEDIA_QUERY = "(prefers-color-scheme: dark)";

type HostThemeProviderProps = {
  accentTokens: SiteAccentTokens;
  children: ReactNode;
  container: HTMLElement;
};

export function HostThemeProvider({ accentTokens, children, container }: HostThemeProviderProps) {
  const [theme, setTheme] = useState(detectHostTheme);

  useEffect(() => {
    const mediaQuery = window.matchMedia?.(DARK_MEDIA_QUERY);
    const updateTheme = () => setTheme(detectHostTheme());
    const observer = new MutationObserver(updateTheme);

    observer.observe(document.documentElement, {
      attributeFilter: ["class", "data-color-scheme", "data-mode", "data-theme", "style"],
      attributes: true,
    });
    if (document.body) {
      observer.observe(document.body, {
        attributeFilter: ["class", "data-color-scheme", "data-mode", "data-theme", "style"],
        attributes: true,
      });
    }
    mediaQuery?.addEventListener("change", updateTheme);
    updateTheme();
    return () => {
      observer.disconnect();
      mediaQuery?.removeEventListener("change", updateTheme);
    };
  }, []);

  useLayoutEffect(() => {
    const tokens = hostThemeTokens(accentTokens)[theme];
    container.dataset.quotecueTheme = theme;
    container.style.color = tokens.text;
    container.style.colorScheme = theme;
    for (const [role, value] of Object.entries(tokens)) {
      container.style.setProperty(`--qc-${role}`, value);
    }
    return () => {
      delete container.dataset.quotecueTheme;
      container.style.removeProperty("color");
      container.style.removeProperty("color-scheme");
      for (const role of Object.keys(tokens)) {
        container.style.removeProperty(`--qc-${role}`);
      }
    };
  }, [accentTokens, container, theme]);

  return <HostThemeContext.Provider value={theme}>{children}</HostThemeContext.Provider>;
}

export function useHostTheme() {
  return useContext(HostThemeContext);
}

export function hostThemeTokens(accentTokens: SiteAccentTokens) {
  return {
    light: {
      ...accentTokens,
      border: "#8a8a8a",
      danger: "#b91c1c",
      divider: "#e8e8e8",
      muted: "#525252",
      shadow: "0 18px 48px rgb(0 0 0 / 0.18)",
      surface: "#ffffff",
      text: "#171717",
    },
    dark: {
      ...accentTokens,
      border: "#737373",
      danger: "#f87171",
      divider: "#323232",
      muted: "#a3a3a3",
      shadow: "0 18px 56px rgb(0 0 0 / 0.5)",
      surface: "#171717",
      text: "#fafafa",
    },
  } as const;
}

export function detectHostTheme(
  html: HTMLElement = document.documentElement,
  body: HTMLElement | null = document.body,
  prefersDark = window.matchMedia?.(DARK_MEDIA_QUERY).matches ?? false,
): HostTheme {
  for (const element of [html, body]) {
    if (!element) {
      continue;
    }
    const declaredTheme = `${element.dataset.theme ?? ""} ${element.dataset.colorScheme ?? ""} ${element.dataset.mode ?? ""}`;
    if (/\bdark\b/i.test(declaredTheme) || element.classList.contains("dark")) {
      return "dark";
    }
    if (/\blight\b/i.test(declaredTheme) || element.classList.contains("light")) {
      return "light";
    }
    if (element.style.colorScheme === "dark") {
      return "dark";
    }
    if (element.style.colorScheme === "light") {
      return "light";
    }
  }
  return prefersDark ? "dark" : "light";
}
