import { describe, expect, it } from "vitest";

import type { SiteAdapter } from "@/features/host/dom-host";
import { createTextNormalizer } from "@/features/host/text-normalizer";

describe("host text normalization", () => {
  it("reads textarea values instead of their child text", () => {
    const textarea = document.createElement("textarea");
    textarea.textContent = "stale child text";
    textarea.value = "current value";

    expect(createTextNormalizer(adapter("textarea")).composerText(textarea)).toBe("current value");
  });

  it("collapses host-reflowed whitespace for exact full-text comparison", () => {
    const { normalizedText } = createTextNormalizer(adapter("contenteditable"));

    expect(normalizedText("  first\n\nsecond\tthird  ")).toBe("first second third");
  });

  it("delegates site-specific normalization to the adapter", () => {
    const hostAdapter = adapter("contenteditable");
    hostAdapter.normalizeSubmittedText = (text) => text.replaceAll("\u200b", "");
    const { normalizedText } = createTextNormalizer(hostAdapter);

    expect(normalizedText("first\u200bsecond")).toBe("firstsecond");
  });
});

function adapter(composerKind: SiteAdapter["composerKind"]): SiteAdapter {
  return {
    assistantMessageSelector: "article",
    composerButtonSelector: "button",
    composerKind,
    composerSelector: "[contenteditable]",
    conversationPathPattern: /^\/c\/([^/]+)/,
    selectionActionMode: "overlay",
    sendButtonSelector: "button",
    userMessageSelector: "[data-user]",
    messageId: (message) => message.id,
  };
}
