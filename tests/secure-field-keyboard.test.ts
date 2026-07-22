import { describe, expect, it } from "vitest";

import { isSecureFieldSaveShortcut } from "@/features/annotations/secure-field-keyboard";

describe("secure field keyboard behavior", () => {
  it("saves a single-line field on Enter outside IME composition", () => {
    expect(isSecureFieldSaveShortcut(keyboardEvent(), "input")).toBe(true);
    expect(isSecureFieldSaveShortcut(keyboardEvent({ isComposing: true }), "input")).toBe(false);
  });

  it("requires Command or Control to save a multiline field", () => {
    expect(isSecureFieldSaveShortcut(keyboardEvent(), "textarea")).toBe(false);
    expect(isSecureFieldSaveShortcut(keyboardEvent({ metaKey: true }), "textarea")).toBe(true);
    expect(isSecureFieldSaveShortcut(keyboardEvent({ ctrlKey: true }), "textarea")).toBe(true);
    expect(
      isSecureFieldSaveShortcut(keyboardEvent({ ctrlKey: true, isComposing: true }), "textarea"),
    ).toBe(false);
  });
});

function keyboardEvent(overrides: Partial<KeyboardEvent> = {}) {
  return {
    ctrlKey: false,
    isComposing: false,
    key: "Enter",
    metaKey: false,
    ...overrides,
  };
}
