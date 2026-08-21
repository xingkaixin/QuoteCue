import type { ComponentProps } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AnnotationSendControl } from "@/features/annotations/AnnotationSendControl";

afterEach(() => {
  document.body.replaceChildren();
});

describe("AnnotationSendControl", () => {
  it("disables sending while pending and exposes retry after failure", async () => {
    const onSend = vi.fn();
    const mounted = await mountSendControl({
      onSend,
      state: { status: "sending" },
    });

    expect(mounted.container.querySelector('[role="status"]')?.textContent).toContain(
      "Sending annotations",
    );
    expect(
      mounted.container.querySelector<HTMLButtonElement>('[aria-label="Send annotations"]')
        ?.disabled,
    ).toBe(true);

    await mounted.render({
      state: { status: "failed", reason: "send-unavailable" },
    });
    expect(mounted.container.querySelector('[role="status"]')?.textContent).toContain(
      "annotation draft was kept",
    );
    const retryButton = mounted.container.querySelector<HTMLButtonElement>(
      '[aria-label="Retry sending annotations"]',
    );
    expect(retryButton?.disabled).toBe(false);
    await act(async () => retryButton?.click());
    expect(onSend).toHaveBeenCalledOnce();

    await act(async () => mounted.root.unmount());
  });

  it("distinguishes confirmation timeout from an unavailable composer", async () => {
    const mounted = await mountSendControl({
      state: { status: "failed", reason: "confirmation-timeout" },
    });

    expect(mounted.container.querySelector('[role="status"]')?.textContent).toContain(
      "wasn't confirmed in time",
    );

    await mounted.render({
      state: { status: "failed", reason: "composer-unavailable" },
    });
    expect(mounted.container.querySelector('[role="status"]')?.textContent).toContain(
      "couldn't access the message box",
    );

    await mounted.render({
      state: { status: "failed", reason: "prompt-too-long" },
    });
    expect(mounted.container.querySelector('[role="status"]')?.textContent).toContain(
      "too long to send",
    );

    await act(async () => mounted.root.unmount());
  });
});

type SendControlProps = ComponentProps<typeof AnnotationSendControl>;

async function mountSendControl(overrides: Partial<SendControlProps> = {}) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const baseProps: SendControlProps = {
    onSend: vi.fn(),
    position: {
      bottom: 236,
      height: 36,
      left: 200,
      right: 236,
      top: 200,
      width: 36,
    },
    state: { status: "idle" },
    ...overrides,
  };
  let currentProps = baseProps;

  await act(async () => root.render(<AnnotationSendControl {...currentProps} />));

  return {
    container,
    render: async (nextOverrides: Partial<SendControlProps>) => {
      currentProps = { ...currentProps, ...nextOverrides };
      await act(async () => root.render(<AnnotationSendControl {...currentProps} />));
    },
    root,
  };
}
