import { describe, expect, it } from "vitest";

import {
  decodeSecureFieldCommand,
  decodeSecureFieldEvent,
  decodeSecureFieldInit,
  SECURE_FIELD_INIT,
} from "@/features/secure-field/secure-field-protocol";

const config = {
  ariaLabel: "Annotation content",
  kind: "textarea" as const,
  lang: "en",
  maxLength: 4_000,
  name: "quotecue-annotation-comment",
  placeholder: "Add a comment",
  theme: "dark" as const,
  value: "private annotation",
};

describe("secure field protocol", () => {
  it("accepts only a complete init message with the frame token", () => {
    const message = { type: SECURE_FIELD_INIT, token: "frame-token", config };

    expect(decodeSecureFieldInit(message, "frame-token")).toEqual(message);
    expect(decodeSecureFieldInit(message, "different-token")).toBeNull();
    expect(
      decodeSecureFieldInit(
        { ...message, config: { ...config, value: { exposed: true } } },
        "frame-token",
      ),
    ).toBeNull();
    expect(
      decodeSecureFieldInit({ ...message, config: { ...config, maxLength: 0 } }, "frame-token"),
    ).toBeNull();
  });

  it("rejects malformed commands and field events", () => {
    expect(decodeSecureFieldCommand({ type: "focus" })).toEqual({ type: "focus" });
    const update = {
      ariaLabel: "批注内容",
      lang: "zh-CN",
      placeholder: "添加批注",
      theme: "dark",
      value: "下一条",
    } as const;
    expect(decodeSecureFieldCommand({ type: "update", update })).toEqual({
      type: "update",
      update,
    });
    expect(
      decodeSecureFieldCommand({ type: "update", update: { ...update, theme: "sepia" } }),
    ).toBeNull();
    expect(
      decodeSecureFieldCommand({ type: "update", update: { ...update, value: 1 } }),
    ).toBeNull();
    expect(decodeSecureFieldEvent({ type: "save", value: "comment" })).toEqual({
      type: "save",
      value: "comment",
    });
    expect(decodeSecureFieldEvent({ type: "ready" })).toEqual({ type: "ready" });
    expect(decodeSecureFieldEvent({ type: "focus-change", focused: true })).toBeNull();
    expect(decodeSecureFieldEvent({ type: "save" })).toBeNull();
  });
});
