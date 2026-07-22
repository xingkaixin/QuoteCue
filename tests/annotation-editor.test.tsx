import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AnnotationEditor } from "@/features/annotations/AnnotationEditor";

vi.mock("@/features/annotations/SecureTextField", async () => {
  const { forwardRef, useEffect, useImperativeHandle, useRef } = await import("react");
  type FakeSecureFieldProps = {
    ariaLabel: string;
    onCancel: () => void;
    onChange: (value: string) => void;
    value: string;
  };
  return {
    SecureTextField: forwardRef<{ focus: () => void }, FakeSecureFieldProps>(
      function FakeSecureTextField({ ariaLabel, onCancel, onChange, value }, ref) {
        const fieldRef = useRef<HTMLTextAreaElement>(null);
        useImperativeHandle(ref, () => ({ focus: () => fieldRef.current?.focus() }), []);
        useEffect(() => fieldRef.current?.focus(), []);
        return (
          <textarea
            aria-label={ariaLabel}
            onChange={(event) => onChange(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                onCancel();
              }
            }}
            ref={fieldRef}
            value={value}
          />
        );
      },
    ),
  };
});

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

describe("AnnotationEditor", () => {
  it("closes on the first outside interaction or Escape when unchanged", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const onCancel = vi.fn();
    const { container, root } = await renderEditor(onCancel);

    await act(async () => outsidePointerDown());
    expect(onCancel).toHaveBeenCalledOnce();

    onCancel.mockClear();
    await act(async () => {
      container
        .querySelector("textarea")
        ?.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
    });
    expect(onCancel).toHaveBeenCalledOnce();

    await act(async () => root.unmount());
  });

  it("shakes once before dismissing dirty changes", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const animate = vi.fn();
    Object.defineProperty(Element.prototype, "animate", { configurable: true, value: animate });
    const onCancel = vi.fn();
    const { container, root } = await renderEditor(onCancel);
    const textarea = container.querySelector<HTMLTextAreaElement>("textarea");
    await act(async () => changeTextarea(textarea, "changed comment"));

    let firstInteraction: MouseEvent | undefined;
    await act(async () => {
      firstInteraction = outsidePointerDown();
    });
    expect(firstInteraction?.defaultPrevented).toBe(true);
    expect(animate).toHaveBeenCalledOnce();
    expect(onCancel).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alertdialog"]')).toBeNull();

    await act(async () => outsidePointerDown());
    expect(onCancel).toHaveBeenCalledOnce();

    await act(async () => root.unmount());
  });

  it("warns again after the comment changes", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const animate = vi.fn();
    Object.defineProperty(Element.prototype, "animate", { configurable: true, value: animate });
    const onCancel = vi.fn();
    const { container, root } = await renderEditor(onCancel);
    const textarea = container.querySelector<HTMLTextAreaElement>("textarea");

    await act(async () => changeTextarea(textarea, "first change"));
    await act(async () => outsidePointerDown());
    await act(async () => changeTextarea(textarea, "second change"));
    await act(async () => outsidePointerDown());

    expect(animate).toHaveBeenCalledTimes(2);
    expect(onCancel).not.toHaveBeenCalled();

    await act(async () => root.unmount());
  });

  it("treats Escape and Cancel as explicit dismissal", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const onCancel = vi.fn();
    const { container, root } = await renderEditor(onCancel);
    const textarea = container.querySelector<HTMLTextAreaElement>("textarea");
    await act(async () => changeTextarea(textarea, "changed comment"));

    await act(async () => {
      textarea?.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
    });
    expect(onCancel).toHaveBeenCalledOnce();

    onCancel.mockClear();
    await act(async () => findButton(container, "Cancel")?.click());
    expect(onCancel).toHaveBeenCalledOnce();

    await act(async () => root.unmount());
  });

  it("warns and restores focus after dirty focus loss", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const animate = vi.fn();
    Object.defineProperty(Element.prototype, "animate", { configurable: true, value: animate });
    const onCancel = vi.fn();
    const { container, root } = await renderEditor(onCancel);
    const textarea = container.querySelector<HTMLTextAreaElement>("textarea");
    const outsideButton = document.createElement("button");
    document.body.append(outsideButton);
    await act(async () => changeTextarea(textarea, "changed comment"));

    await act(async () => {
      outsideButton.focus();
      await focusSettled();
    });
    expect(animate).toHaveBeenCalledOnce();
    expect(onCancel).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(textarea);

    await act(async () => {
      outsideButton.focus();
      await focusSettled();
    });
    expect(onCancel).toHaveBeenCalledOnce();

    await act(async () => root.unmount());
  });

  it("keeps the editor open while focus settles inside its secure field", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const onCancel = vi.fn();
    const { container, root } = await renderEditor(onCancel);
    const textarea = container.querySelector<HTMLTextAreaElement>("textarea");
    expect(document.activeElement).toBe(textarea);

    await act(async () => {
      textarea?.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: null }));
      await focusSettled();
    });
    expect(onCancel).not.toHaveBeenCalled();

    await act(async () => root.unmount());
  });

  it("distinguishes editor controls from other QuoteCue controls in a closed shadow", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const animate = vi.fn();
    Object.defineProperty(Element.prototype, "animate", { configurable: true, value: animate });
    const onCancel = vi.fn();
    const host = document.createElement("quotecue-ui");
    host.setAttribute("data-quotecue-host", "");
    const shadowRoot = host.attachShadow({ mode: "closed" });
    const container = document.createElement("div");
    const otherControl = document.createElement("button");
    shadowRoot.append(container, otherControl);
    document.body.append(host);
    const root = createRoot(container);

    await act(async () => root.render(editor(onCancel)));
    const textarea = container.querySelector<HTMLTextAreaElement>("textarea");
    await act(async () => changeTextarea(textarea, "changed comment"));
    await act(async () => {
      textarea?.dispatchEvent(
        new MouseEvent("pointerdown", { bubbles: true, cancelable: true, composed: true }),
      );
    });
    expect(animate).not.toHaveBeenCalled();

    const otherInteraction = new MouseEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      composed: true,
    });
    await act(async () => otherControl.dispatchEvent(otherInteraction));
    expect(otherInteraction.defaultPrevented).toBe(true);
    expect(animate).toHaveBeenCalledOnce();
    expect(onCancel).not.toHaveBeenCalled();

    await act(async () => root.unmount());
  });
});

async function renderEditor(onCancel: () => void) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(editor(onCancel)));
  return { container, root };
}

function editor(onCancel: () => void) {
  return (
    <AnnotationEditor
      annotation={annotation}
      draft={draft}
      onCancel={onCancel}
      onDelete={vi.fn()}
      onSave={vi.fn()}
    />
  );
}

function outsidePointerDown() {
  const event = new MouseEvent("pointerdown", {
    bubbles: true,
    cancelable: true,
    composed: true,
  });
  document.body.dispatchEvent(event);
  return event;
}

function changeTextarea(textarea: HTMLTextAreaElement | null, value: string) {
  if (!textarea) {
    throw new Error("Missing annotation textarea");
  }
  const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  setValue?.call(textarea, value);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

function findButton(container: HTMLElement, label: string) {
  return Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent?.trim() === label,
  );
}

function nextFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

async function focusSettled() {
  await nextFrame();
  await nextFrame();
  await nextFrame();
}
