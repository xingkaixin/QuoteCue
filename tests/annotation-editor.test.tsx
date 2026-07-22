import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AnnotationEditor } from "@/features/annotations/AnnotationEditor";

const annotation = {
  id: "annotation-1",
  anchor: {
    messageId: "message-1",
    quote: "selected text",
    prefix: "",
    suffix: "",
    start: 0,
    end: 13,
  },
  comment: "saved comment",
};

const draft = {
  anchor: annotation.anchor,
  rect: { bottom: 120, height: 30, left: 100, right: 220, top: 90, width: 120 },
};

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

function outsidePointerDown() {
  const event = new MouseEvent("pointerdown", {
    bubbles: true,
    cancelable: true,
    composed: true,
  });
  document.body.dispatchEvent(event);
  return event;
}

describe("AnnotationEditor", () => {
  it("closes on the first outside interaction when unchanged", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const onCancel = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <AnnotationEditor
          annotation={annotation}
          draft={draft}
          onCancel={onCancel}
          onDelete={vi.fn()}
          onSave={vi.fn()}
        />,
      );
    });

    await act(async () => outsidePointerDown());
    expect(onCancel).toHaveBeenCalledOnce();

    await act(async () => root.unmount());
  });

  it("warns once before discarding unsaved changes", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const animate = vi.fn();
    Object.defineProperty(Element.prototype, "animate", {
      configurable: true,
      value: animate,
    });
    const onCancel = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <AnnotationEditor
          annotation={annotation}
          draft={draft}
          onCancel={onCancel}
          onDelete={vi.fn()}
          onSave={vi.fn()}
        />,
      );
    });

    const textarea = container.querySelector<HTMLTextAreaElement>("textarea");
    await act(async () => {
      if (!textarea) {
        throw new Error("Missing annotation textarea");
      }
      const setTextareaValue = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )?.set;
      setTextareaValue?.call(textarea, "changed comment");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });

    let firstOutsideInteraction: MouseEvent | undefined;
    await act(async () => {
      firstOutsideInteraction = outsidePointerDown();
    });
    expect(firstOutsideInteraction?.defaultPrevented).toBe(true);
    expect(animate).toHaveBeenCalledOnce();
    expect(onCancel).not.toHaveBeenCalled();

    await act(async () => {
      textarea?.dispatchEvent(
        new FocusEvent("focusout", { bubbles: true, relatedTarget: document.body }),
      );
    });
    expect(onCancel).not.toHaveBeenCalled();

    await act(async () => outsidePointerDown());
    expect(onCancel).toHaveBeenCalledOnce();

    await act(async () => root.unmount());
  });
});
