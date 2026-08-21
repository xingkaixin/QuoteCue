import { describe, expect, it } from "vitest";

import { richTextComposer, textareaComposer } from "@/features/host/composer-access";
import { createTextNormalizer } from "@/features/host/text-normalizer";

describe("host text normalization", () => {
  it("reads textarea values instead of their child text", () => {
    const textarea = document.createElement("textarea");
    textarea.textContent = "stale child text";
    textarea.value = "current value";

    expect(createTextNormalizer(textareaComposer("textarea")).composerText(textarea)).toBe(
      "current value",
    );
  });

  it("collapses host-reflowed whitespace for exact full-text comparison", () => {
    const { normalizedRenderedText } = createTextNormalizer(richTextComposer("[contenteditable]"));

    expect(normalizedRenderedText("  first\n\nsecond\tthird  ")).toBe("first second third");
  });

  it("delegates site-specific normalization to the composer capability", () => {
    const { normalizedRenderedText } = createTextNormalizer(
      richTextComposer("[contenteditable]", (text) => text.replaceAll("\u200b", "")),
    );

    expect(normalizedRenderedText("first\u200bsecond")).toBe("firstsecond");
  });
});
