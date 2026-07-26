import { afterEach, describe, expect, it, vi } from "vitest";

import { annotationEditorPosition } from "@/features/annotations/annotation-editor-position";

const rect = { bottom: 120, height: 20, left: 80, right: 180, top: 100, width: 100 };

afterEach(() => vi.unstubAllGlobals());

describe("annotation editor position", () => {
  it("places the editor beside and below the annotation endpoint when space is available", () => {
    const position = annotationEditorPosition(rect, { height: 230, width: 380 }, viewport());

    expect(position).toMatchObject({ left: 190, top: 130 });
  });

  it("places the editor on the left when the right side would overflow", () => {
    const position = annotationEditorPosition(
      {
        ...rect,
        left: 800,
        right: 900,
      },
      { height: 230, width: 380 },
      viewport(),
    );

    expect(position.left).toBe(410);
  });

  it("places the editor above when the area below would overflow", () => {
    const position = annotationEditorPosition(
      {
        ...rect,
        bottom: 720,
        top: 700,
      },
      { height: 230, width: 380 },
      viewport(),
    );

    expect(position.top).toBe(460);
  });

  it("shrinks and clamps an editor inside a narrower viewport", () => {
    vi.stubGlobal("innerWidth", 320);
    vi.stubGlobal("innerHeight", 568);

    const position = annotationEditorPosition(rect, { height: 230, width: 380 });

    expect(position).toMatchObject({ left: 12, maxWidth: 296 });
  });

  it("honors visual viewport offsets", () => {
    const position = annotationEditorPosition(
      rect,
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

function viewport() {
  return { height: 800, left: 0, top: 0, width: 1_000 };
}
