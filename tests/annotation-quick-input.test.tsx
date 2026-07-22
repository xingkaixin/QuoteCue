import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AnnotationQuickInput } from "@/features/annotations/AnnotationQuickInput";

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
        const fieldRef = useRef<HTMLInputElement>(null);
        useImperativeHandle(ref, () => ({ focus: () => fieldRef.current?.focus() }), []);
        return (
          <input
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

  it("confirms before closing a dirty quick input", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const onClose = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<AnnotationQuickInput draft={draft} onClose={onClose} onSave={vi.fn()} />);
    });
    const input = container.querySelector<HTMLInputElement>("input");
    await act(async () => changeInput(input, "draft comment"));
    let outsideInteraction: MouseEvent | undefined;
    await act(async () => {
      outsideInteraction = outsidePointerDown();
    });

    expect(outsideInteraction?.defaultPrevented).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alertdialog"]')).not.toBeNull();
    await act(async () => findButton(container, "Discard changes")?.click());
    expect(onClose).toHaveBeenCalledOnce();

    await act(async () => root.unmount());
  });

  it("routes dirty Escape through discard confirmation", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const onClose = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<AnnotationQuickInput draft={draft} onClose={onClose} onSave={vi.fn()} />);
    });
    const input = container.querySelector<HTMLInputElement>("input");
    await act(async () => {
      changeInput(input, "draft comment");
      input?.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
    });

    expect(onClose).not.toHaveBeenCalled();
    expect(document.activeElement?.textContent).toBe("Continue editing");

    await act(async () => root.unmount());
  });
});

function changeInput(input: HTMLInputElement | null, value: string) {
  if (!input) {
    throw new Error("Missing annotation input");
  }
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setValue?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
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

function findButton(container: HTMLElement, label: string) {
  return Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent?.trim() === label,
  );
}
