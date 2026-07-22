import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AnnotationSummary } from "@/features/annotations/AnnotationSummary";

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
  comment: "",
};

afterEach(() => {
  document.body.replaceChildren();
});

describe("AnnotationSummary", () => {
  it("shows annotation details and row actions on hover", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const onRemove = vi.fn();
    const onSend = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <AnnotationSummary
          annotations={[annotation]}
          onClear={vi.fn()}
          onEdit={vi.fn()}
          onRemove={onRemove}
          onSend={onSend}
          position={{ left: 10, top: 10 }}
          sendStatus="idle"
          sendPosition={{ height: 36, left: 200, top: 200, width: 36 }}
        />,
      );
    });

    expect(container.textContent).toContain("1 annotation");
    expect(container.textContent).not.toContain("Selected text:");

    await act(async () => {
      container.firstElementChild?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });

    expect(container.textContent).toContain("Selected text:");
    expect(container.textContent).toContain("selected text");
    expect(container.textContent).toContain("No comment added");

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[aria-label="Delete annotation 1"]')?.click();
    });
    expect(onRemove).toHaveBeenCalledWith("annotation-1");

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[aria-label="Send annotations"]')?.click();
    });
    expect(onSend).toHaveBeenCalledOnce();

    await act(async () => root.unmount());
  });

  it("disables sending while pending and exposes retry after failure", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const onSend = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const renderSummary = (sendStatus: "pending" | "failed") => (
      <AnnotationSummary
        annotations={[annotation]}
        onClear={vi.fn()}
        onEdit={vi.fn()}
        onRemove={vi.fn()}
        onSend={onSend}
        position={{ left: 10, top: 10 }}
        sendPosition={{ height: 36, left: 200, top: 200, width: 36 }}
        sendStatus={sendStatus}
      />
    );

    await act(async () => root.render(renderSummary("pending")));
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      "Sending annotations",
    );
    expect(
      container.querySelector<HTMLButtonElement>('[aria-label="Send annotations"]')?.disabled,
    ).toBe(true);

    await act(async () => root.render(renderSummary("failed")));
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      "annotation draft was kept",
    );
    const retryButton = container.querySelector<HTMLButtonElement>(
      '[aria-label="Retry sending annotations"]',
    );
    expect(retryButton?.disabled).toBe(false);
    await act(async () => retryButton?.click());
    expect(onSend).toHaveBeenCalledOnce();

    await act(async () => root.unmount());
  });
});
