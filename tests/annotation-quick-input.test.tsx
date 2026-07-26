import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AnnotationQuickInput } from "@/features/annotations/AnnotationQuickInput";

import { HostTestProvider } from "./fixtures/host-provider";

vi.mock("@/features/secure-field/SecureTextField", async () => {
  const { forwardRef, useEffect, useImperativeHandle, useRef } = await import("react");
  type FakeSecureFieldProps = {
    ariaLabel: string;
    className?: string;
    name: string;
    onCancel: () => void;
    onChange: (value: string) => void;
    placeholder: string;
    value: string;
  };
  return {
    SecureTextField: forwardRef<{ focus: () => void }, FakeSecureFieldProps>(
      function FakeSecureTextField(
        { ariaLabel, className, name, onCancel, onChange, placeholder, value },
        ref,
      ) {
        const fieldRef = useRef<HTMLInputElement>(null);
        useImperativeHandle(ref, () => ({ focus: () => fieldRef.current?.focus() }), []);
        useEffect(() => fieldRef.current?.focus(), []);
        return (
          <input
            aria-label={ariaLabel}
            className={className}
            name={name}
            onChange={(event) => onChange(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                onCancel();
              }
            }}
            placeholder={placeholder}
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
    format: "exact" as const,
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
  vi.restoreAllMocks();
});

describe("AnnotationQuickInput", () => {
  it("exposes a focused input and labelled save action", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const { container, root } = await renderQuickInput(vi.fn(), vi.fn());
    const shell = container.firstElementChild;
    const input = container.querySelector<HTMLInputElement>("input");
    const saveButton = container.querySelector<HTMLButtonElement>('[aria-label="Save annotation"]');

    expect(shell?.classList).toContain("qc-divider");
    expect(shell?.classList).not.toContain("qc-elevated");
    expect(input?.type).toBe("text");
    expect(input?.name).toBe("quotecue-annotation-comment");
    expect(input?.getAttribute("aria-label")).toBe("Annotation content");
    expect(input?.placeholder).toBe("Add an optional comment…");
    expect(input?.value).toBe("");
    expect(document.activeElement).toBe(input);
    expect(saveButton?.type).toBe("button");
    expect(saveButton?.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");

    await act(async () => root.unmount());
  });

  it("allows saving a selection without a comment", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const onSave = vi.fn();
    const { container, root } = await renderQuickInput(vi.fn(), onSave);

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[aria-label="Save annotation"]')?.click();
    });
    expect(onSave).toHaveBeenCalledWith("");

    await act(async () => root.unmount());
  });

  it("shakes once before closing a dirty quick input", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const animate = vi.fn();
    Object.defineProperty(Element.prototype, "animate", { configurable: true, value: animate });
    const onClose = vi.fn();
    const { container, root } = await renderQuickInput(onClose, vi.fn());
    const input = container.querySelector<HTMLInputElement>("input");
    await act(async () => changeInput(input, "draft comment"));

    let firstInteraction: MouseEvent | undefined;
    await act(async () => {
      firstInteraction = outsidePointerDown();
    });
    expect(firstInteraction?.defaultPrevented).toBe(true);
    expect(animate).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => outsidePointerDown());
    expect(onClose).toHaveBeenCalledOnce();

    await act(async () => root.unmount());
  });

  it("treats Escape as explicit dismissal", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const onClose = vi.fn();
    const { container, root } = await renderQuickInput(onClose, vi.fn());
    const input = container.querySelector<HTMLInputElement>("input");
    await act(async () => changeInput(input, "draft comment"));

    await act(async () => {
      input?.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
    });
    expect(onClose).toHaveBeenCalledOnce();

    await act(async () => root.unmount());
  });
});

async function renderQuickInput(onClose: () => void, onSave: (comment: string) => void) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <HostTestProvider>
        <AnnotationQuickInput onClose={onClose} onSave={onSave} rect={draft.rect} />
      </HostTestProvider>,
    );
  });
  return { container, root };
}

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
