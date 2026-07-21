import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AnnotationQuickInput } from "@/features/annotations/AnnotationQuickInput";

const draft = {
  anchor: {
    messageId: "message-1",
    quote: "selected text",
    prefix: "",
    suffix: "",
    start: 0,
    end: 13,
  },
  rect: {
    bottom: 120,
    height: 20,
    left: 80,
    right: 180,
    top: 100,
    width: 100,
  },
};

afterEach(() => {
  document.body.replaceChildren();
});

describe("AnnotationQuickInput", () => {
  it("allows saving a selection without a comment", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const onSave = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<AnnotationQuickInput draft={draft} onClose={vi.fn()} onSave={onSave} />);
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[aria-label="Save annotation"]')?.click();
    });

    expect(onSave).toHaveBeenCalledWith("");

    await act(async () => root.unmount());
  });
});
