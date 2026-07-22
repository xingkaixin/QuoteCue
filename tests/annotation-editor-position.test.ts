import { afterEach, describe, expect, it, vi } from "vitest";

import { annotationEditorPosition } from "@/features/annotations/annotation-editor-position";

const draft = {
  anchor: {
    messageId: "message-1",
    quote: "selected text",
    prefix: "",
    suffix: "",
    start: 0,
    end: 13,
  },
  rect: { bottom: 120, height: 20, left: 80, right: 180, top: 100, width: 100 },
};

afterEach(() => vi.unstubAllGlobals());

describe("annotation editor position", () => {
  it("shrinks and clamps an editor inside a narrower viewport", () => {
    vi.stubGlobal("innerWidth", 320);
    vi.stubGlobal("innerHeight", 568);

    const position = annotationEditorPosition(draft, { height: 230, width: 380 });

    expect(position).toMatchObject({ left: 12, maxWidth: 296 });
  });

  it("honors visual viewport offsets", () => {
    const position = annotationEditorPosition(
      draft,
      { height: 230, width: 380 },
      {
        height: 400,
        left: 50,
        top: 100,
        width: 300,
      },
    );

    expect(position.left).toBeGreaterThanOrEqual(62);
    expect(position.top).toBeGreaterThanOrEqual(112);
    expect(position.maxWidth).toBe(276);
  });
});
