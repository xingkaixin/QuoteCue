import { describe, expect, it } from "vitest";

import {
  clampPositionToViewport,
  positionAdjacentToRect,
} from "@/features/layout/floating-position";

const viewport = { height: 400, left: 50, top: 100, width: 300 };

describe("floating viewport position", () => {
  it("flips adjacent content before clamping inside an offset visual viewport", () => {
    const position = positionAdjacentToRect(
      { bottom: 380, left: 280, right: 330, top: 360 },
      { height: 120, width: 120 },
      { gap: 10, margin: 12, viewport },
    );

    expect(position).toMatchObject({ left: 150, top: 230 });
  });

  it("clamps point-aligned content and reports available size", () => {
    const position = clampPositionToViewport(
      { left: 340, top: 90 },
      { height: 24, width: 24 },
      { margin: 6, viewport },
    );

    expect(position).toEqual({
      left: 320,
      maxHeight: 388,
      maxWidth: 288,
      top: 106,
    });
  });
});
