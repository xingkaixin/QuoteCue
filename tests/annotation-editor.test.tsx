import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AnnotationEditor } from "@/features/annotations/AnnotationEditor";

vi.mock("@/features/annotations/SecureTextField", async () => {
  const { forwardRef, useImperativeHandle, useRef } = await import("react");
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
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => root.render(editor(onCancel)));
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

  it("requires an explicit choice before discarding dirty changes", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const animate = vi.fn();
    Object.defineProperty(Element.prototype, "animate", { configurable: true, value: animate });
    const onCancel = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => root.render(editor(onCancel)));
    const textarea = container.querySelector<HTMLTextAreaElement>("textarea");
    await act(async () => changeTextarea(textarea, "changed comment"));

    let outsideInteraction: MouseEvent | undefined;
    await act(async () => {
      outsideInteraction = outsidePointerDown();
    });
    expect(outsideInteraction?.defaultPrevented).toBe(true);
    expect(container.querySelector('[role="alertdialog"]')?.textContent).toContain(
      "Unsaved changes",
    );
    expect(document.activeElement?.textContent).toBe("Continue editing");
    expect(textarea?.closest("[inert]")).not.toBeNull();
    expect(animate).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();

    await act(async () => {
      document.activeElement?.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "Tab" }),
      );
    });
    expect(document.activeElement?.textContent).toBe("Discard changes");
    await act(async () => {
      document.activeElement?.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "Tab", shiftKey: true }),
      );
    });
    expect(document.activeElement?.textContent).toBe("Continue editing");

    await act(async () => outsidePointerDown());
    expect(onCancel).not.toHaveBeenCalled();
    await act(async () => {
      findButton(container, "Continue editing")?.click();
      await nextFrame();
    });
    expect(container.querySelector('[role="alertdialog"]')).toBeNull();
    expect(document.activeElement).toBe(textarea);

    await act(async () => findButton(container, "Cancel")?.click());
    expect(onCancel).not.toHaveBeenCalled();
    await act(async () => findButton(container, "Discard changes")?.click());
    expect(onCancel).toHaveBeenCalledOnce();

    await act(async () => root.unmount());
  });

  it("routes dirty Escape through the same confirmation", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const onCancel = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => root.render(editor(onCancel)));
    const textarea = container.querySelector<HTMLTextAreaElement>("textarea");
    await act(async () => {
      changeTextarea(textarea, "changed comment");
      textarea?.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
    });

    expect(onCancel).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alertdialog"]')).not.toBeNull();
    expect(document.activeElement?.textContent).toBe("Continue editing");

    await act(async () => root.unmount());
  });

  it("routes dirty focus loss through the same confirmation", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const onCancel = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => root.render(editor(onCancel)));
    const textarea = container.querySelector<HTMLTextAreaElement>("textarea");
    const outsideButton = document.createElement("button");
    document.body.append(outsideButton);
    await act(async () => changeTextarea(textarea, "changed comment"));
    await act(async () => {
      outsideButton.focus();
      await focusSettled();
    });

    expect(onCancel).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alertdialog"]')).not.toBeNull();

    await act(async () => root.unmount());
  });

  it("keeps the editor open while focus settles inside its secure field", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const onCancel = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => root.render(editor(onCancel)));
    const textarea = container.querySelector<HTMLTextAreaElement>("textarea");
    expect(document.activeElement).toBe(textarea);
    await act(async () => {
      textarea?.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: null }));
      await focusSettled();
    });

    expect(onCancel).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alertdialog"]')).toBeNull();

    await act(async () => root.unmount());
  });

  it("distinguishes editor controls from other QuoteCue controls in a closed shadow", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
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
    expect(container.querySelector('[role="alertdialog"]')).toBeNull();

    const otherInteraction = new MouseEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      composed: true,
    });
    await act(async () => otherControl.dispatchEvent(otherInteraction));
    expect(otherInteraction.defaultPrevented).toBe(true);
    expect(onCancel).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alertdialog"]')).not.toBeNull();

    await act(async () => root.unmount());
  });
});

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
}
