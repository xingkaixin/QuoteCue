import { act, useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { I18nProvider, useI18n } from "@/features/i18n/I18nProvider";

afterEach(() => {
  document.documentElement.removeAttribute("lang");
  document.body.replaceChildren();
});

describe("i18n provider", () => {
  it("refreshes the locale after subscribing to host changes", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    document.documentElement.lang = "en";
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <I18nProvider>
          <ChangeLanguageOnLayout />
          <LocaleProbe />
        </I18nProvider>,
      );
    });

    expect(container.textContent).toBe("ja");
    await act(async () => root.unmount());
  });
});

function ChangeLanguageOnLayout() {
  useLayoutEffect(() => {
    document.documentElement.lang = "ja";
  }, []);
  return null;
}

function LocaleProbe() {
  return useI18n().locale;
}
