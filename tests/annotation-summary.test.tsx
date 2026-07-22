import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PortalContainerProvider } from "@/components/ui/portal-container";
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
  it("exposes the annotation count as a keyboard-focusable button", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement("div");
    const portalContainer = document.createElement("div");
    document.body.append(container, portalContainer);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <PortalContainerProvider container={portalContainer}>
          <AnnotationSummary
            annotations={[annotation]}
            onClear={vi.fn()}
            onEdit={vi.fn()}
            onRemove={vi.fn()}
            onSend={vi.fn()}
            position={{ left: 10, top: 10 }}
            sendPosition={{ height: 36, left: 200, top: 200, width: 36 }}
            sendStatus="idle"
          />
        </PortalContainerProvider>,
      );
    });
    const count = Array.from(container.querySelectorAll("button")).find(
      (element) => element.textContent?.trim() === "1 annotation",
    );

    expect(count?.tagName).toBe("BUTTON");
    expect(count?.tabIndex).toBe(0);

    await act(async () => root.unmount());
  });

  it("opens details with managed focus and returns focus on Escape", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const onRemove = vi.fn();
    const onSend = vi.fn();
    const container = document.createElement("div");
    const portalContainer = document.createElement("div");
    document.body.append(container, portalContainer);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <PortalContainerProvider container={portalContainer}>
          <AnnotationSummary
            annotations={[annotation]}
            onClear={vi.fn()}
            onEdit={vi.fn()}
            onRemove={onRemove}
            onSend={onSend}
            position={{ left: 10, top: 10 }}
            sendStatus="idle"
            sendPosition={{ height: 36, left: 200, top: 200, width: 36 }}
          />
        </PortalContainerProvider>,
      );
    });

    expect(container.textContent).toContain("1 annotation");
    expect(portalContainer.textContent).not.toContain("Selected text:");
    const trigger = Array.from(container.querySelectorAll("button")).find(
      (element) => element.textContent?.trim() === "1 annotation",
    );

    await act(async () => {
      trigger?.click();
    });

    expect(portalContainer.textContent).toContain("Selected text:");
    expect(portalContainer.textContent).toContain("selected text");
    expect(portalContainer.textContent).toContain("No comment added");
    const editButton = portalContainer.querySelector<HTMLButtonElement>(
      '[aria-label="Edit annotation 1"]',
    );
    expect(document.activeElement).toBe(editButton);

    await act(async () => {
      portalContainer
        .querySelector<HTMLButtonElement>('[aria-label="Delete annotation 1"]')
        ?.click();
    });
    expect(onRemove).toHaveBeenCalledWith("annotation-1");

    await act(async () => {
      document.activeElement?.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }),
      );
    });
    expect(portalContainer.textContent).not.toContain("Selected text:");
    expect(document.activeElement).toBe(trigger);

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
    const portalContainer = document.createElement("div");
    document.body.append(container, portalContainer);
    const root = createRoot(container);
    const renderSummary = (sendStatus: "pending" | "failed") => (
      <PortalContainerProvider container={portalContainer}>
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
      </PortalContainerProvider>
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
