import { describe, expect, it } from "vitest";

import { richTextComposer, textareaComposer } from "@/features/host/composer-access";

describe("composer access", () => {
  it("reads textarea values instead of their child text", () => {
    const textarea = document.createElement("textarea");
    textarea.textContent = "stale child text";
    textarea.value = "current value";

    expect(textareaComposer("textarea").read(textarea)).toBe("current value");
  });

  it("collapses host-reflowed whitespace for exact full-text comparison", () => {
    const composer = richTextComposer("[contenteditable]");

    expect(composer.normalize("  first\n\nsecond\tthird  ")).toBe("first second third");
  });

  it("applies site-specific text normalization", () => {
    const composer = richTextComposer("[contenteditable]", (text) => text.replaceAll("\u200b", ""));

    expect(composer.normalize("first\u200bsecond")).toBe("firstsecond");
  });
});
