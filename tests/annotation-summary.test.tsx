import type { ComponentProps } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AnnotationSummary } from "@/features/annotations/AnnotationSummary";
import { numberAnnotations } from "@/features/annotations/annotation-projection";
import { DELETE_UNDO_WINDOW_MS } from "@/features/annotations/use-deferred-annotation-deletion";

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

const secondAnnotation = {
  ...annotation,
  id: "annotation-2",
  anchor: { ...annotation.anchor, messageId: "message-2", quote: "second selection" },
};

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe("AnnotationSummary", () => {
  it("opens details on hover without selecting the first annotation", async () => {
    const { container, root, summary } = await mountSummary();
    const countButton = findCountButton(container);

    expect(countButton?.tagName).toBe("BUTTON");
    expect(countButton?.tabIndex).toBe(0);
    expect(container.querySelector('[role="dialog"]')).toBeNull();

    await hover(summary);

    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog?.classList).toContain("qc-elevated");
    expect(dialog?.classList).not.toContain("border");
    expect(container.textContent).toContain("Selected text:");
    expect(container.textContent).toContain("selected text");
    expect(container.textContent).not.toContain("User comment:");
    expect(container.textContent).not.toContain("No comment added");
    const editButton = container.querySelector<HTMLButtonElement>(
      '[aria-label="Edit annotation 1"]',
    );
    expect(editButton?.parentElement?.classList).toContain("opacity-0");
    expect(editButton?.parentElement?.classList).toContain("group-hover/row:opacity-100");
    expect(document.activeElement).not.toBe(editButton);

    await leave(summary);
    expect(container.querySelector('[role="dialog"]')).toBeNull();

    await act(async () => root.unmount());
  });

  it("shows the comment section only when the annotation has content", async () => {
    const commentedAnnotation = { ...annotation, comment: "Make this more specific" };
    const { container, root, summary } = await mountSummary({
      annotations: numberAnnotations([commentedAnnotation]),
    });

    await hover(summary);

    expect(container.textContent).toContain("User comment:");
    expect(container.textContent).toContain("Make this more specific");

    await act(async () => root.unmount());
  });

  it("shows rendered selection text when DOM text omits layout separators", async () => {
    const tableAnnotation = {
      ...annotation,
      anchor: { ...annotation.anchor, displayQuote: "alpha beta", quote: "alphabeta" },
    };
    const { container, root, summary } = await mountSummary({
      annotations: numberAnnotations([tableAnnotation]),
    });

    await hover(summary);

    expect(container.textContent).toContain("alpha beta");
    expect(container.textContent).not.toContain("alphabeta");

    await act(async () => root.unmount());
  });

  it("keeps hover-only controls compact and keyboard accessible", async () => {
    const onEdit = vi.fn();
    const { container, root, summary } = await mountSummary({ onEdit });
    const countButton = findCountButton(container);
    const clearButton = container.querySelector<HTMLButtonElement>(
      '[aria-label="Clear all annotations"]',
    );

    expect(countButton?.classList).toContain("h-8");
    expect(clearButton?.classList).toContain("size-8");
    expect(clearButton?.classList).toContain("opacity-0");
    expect(clearButton?.classList).toContain("group-hover/summary:opacity-100");

    await act(async () => countButton?.focus());
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(countButton?.getAttribute("aria-expanded")).toBe("true");

    const editButton = container.querySelector<HTMLButtonElement>(
      '[aria-label="Edit annotation 1"]',
    );
    await act(async () => editButton?.click());
    expect(onEdit).toHaveBeenCalledWith(annotation);

    await act(async () => {
      editButton?.focus();
      editButton?.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
    });
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(countButton);

    await leave(summary);
    await act(async () => root.unmount());
  });

  it("disables sending while pending and exposes retry after failure", async () => {
    const onSend = vi.fn();
    const mounted = await mountSummary({ onSend, sendStatus: "pending" });

    expect(mounted.container.querySelector('[role="status"]')?.textContent).toContain(
      "Sending annotations",
    );
    expect(
      mounted.container.querySelector<HTMLButtonElement>('[aria-label="Send annotations"]')
        ?.disabled,
    ).toBe(true);

    await mounted.render({ sendStatus: "failed" });
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

  it("keeps deletion and clear controls enabled while an undo batch is pending", async () => {
    const onRemove = vi.fn();
    const mounted = await mountSummary({
      annotations: numberAnnotations([annotation, secondAnnotation]),
      onRemove,
      pendingDeletionCount: 1,
    });

    await hover(mounted.summary);
    const deleteButtons = Array.from(
      mounted.container.querySelectorAll<HTMLButtonElement>('[aria-label^="Delete annotation"]'),
    );
    const clearButton = mounted.container.querySelector<HTMLButtonElement>(
      '[aria-label="Clear all annotations"]',
    );

    expect(deleteButtons.every((button) => !button.disabled)).toBe(true);
    expect(clearButton?.disabled).toBe(false);
    await act(async () => deleteButtons[1]?.click());
    expect(onRemove).toHaveBeenCalledWith("annotation-2");
    await act(async () => clearButton?.click());
    expect(mounted.container.querySelector('[role="status"]')?.textContent).toContain(
      "Click again to confirm",
    );

    await act(async () => mounted.root.unmount());
  });

  it("animates one batch undo transaction and requires confirmation before clearing", async () => {
    vi.useFakeTimers();
    const onClear = vi.fn();
    const onUndo = vi.fn();
    const mounted = await mountSummary({ onClear, onUndo });

    await mounted.render({
      annotations: numberAnnotations([secondAnnotation]),
      pendingDeletionCount: 1,
      pendingDeletionExpiresAt: 1_000,
    });
    const firstProgress = mounted.container.querySelector<HTMLElement>(".qc-undo-progress");
    expect(firstProgress?.style.animationDuration).toBe(`${DELETE_UNDO_WINDOW_MS}ms`);

    await mounted.render({
      annotations: [],
      pendingDeletionCount: 2,
      pendingDeletionExpiresAt: 2_000,
    });
    const status = mounted.container.querySelector('[role="status"]');
    expect(status?.textContent).toContain("2 annotations removed. 0 remaining.");
    expect(status?.classList).toContain("qc-status-bubble");
    expect(status?.getAttribute("data-exiting")).toBe("false");
    expect(mounted.container.querySelector(".qc-undo-progress")).not.toBe(firstProgress);
    await act(async () => {
      Array.from(mounted.container.querySelectorAll("button"))
        .find((button) => button.textContent === "Undo")
        ?.click();
    });
    expect(onUndo).toHaveBeenCalledOnce();

    await mounted.render({
      annotations: numberAnnotations([annotation]),
      pendingDeletionCount: 0,
      pendingDeletionExpiresAt: null,
    });
    expect(mounted.container.querySelector('[role="status"]')?.getAttribute("data-exiting")).toBe(
      "true",
    );
    await act(async () => vi.advanceTimersByTimeAsync(180));
    expect(mounted.container.querySelector('[role="status"]')).toBeNull();

    const clearButton = mounted.container.querySelector<HTMLButtonElement>(
      '[aria-label="Clear all annotations"]',
    );
    await act(async () => clearButton?.click());
    expect(onClear).not.toHaveBeenCalled();
    expect(mounted.container.querySelector('[role="status"]')?.textContent).toContain(
      "Click again to confirm",
    );
    const confirmButton = mounted.container.querySelector<HTMLButtonElement>(
      '[aria-label="Confirm clearing all annotations"]',
    );
    await act(async () => confirmButton?.click());
    expect(onClear).toHaveBeenCalledOnce();

    await act(async () => mounted.root.unmount());
  });

  it("keeps unresolved annotations visible without offering misleading navigation", async () => {
    const { container, root, summary } = await mountSummary({
      unresolvedAnnotationIds: new Set([annotation.id]),
    });

    await hover(summary);

    expect(container.textContent).toContain("Source position changed");
    const editButton = container.querySelector<HTMLButtonElement>(
      '[aria-label="Edit annotation 1"]',
    );
    expect(editButton?.disabled).toBe(true);
    expect(document.activeElement).not.toBe(
      container.querySelector('[aria-label="Delete annotation 1"]'),
    );

    await act(async () => root.unmount());
  });

  it("uses the supplied ordinal for every numbered control", async () => {
    const { container, root, summary } = await mountSummary({
      annotations: [{ annotation, ordinal: 7 }],
    });

    await hover(summary);

    expect(container.textContent).toContain("7");
    expect(container.querySelector('[aria-label="Edit annotation 7"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Delete annotation 7"]')).not.toBeNull();

    await act(async () => root.unmount());
  });
});

type SummaryProps = ComponentProps<typeof AnnotationSummary>;

async function mountSummary(overrides: Partial<SummaryProps> = {}) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const baseProps: SummaryProps = {
    annotations: numberAnnotations([annotation]),
    onClear: vi.fn(),
    onEdit: vi.fn(),
    onRemove: vi.fn(),
    onSend: vi.fn(),
    onUndo: vi.fn(),
    pendingDeletionCount: 0,
    pendingDeletionExpiresAt: null,
    position: { left: 10, top: 10 },
    sendPosition: {
      bottom: 236,
      height: 36,
      left: 200,
      right: 236,
      top: 200,
      width: 36,
    },
    sendStatus: "idle",
    unresolvedAnnotationIds: new Set(),
    ...overrides,
  };
  let currentProps = baseProps;

  await act(async () => root.render(<AnnotationSummary {...currentProps} />));

  return {
    container,
    render: async (nextOverrides: Partial<SummaryProps>) => {
      currentProps = { ...currentProps, ...nextOverrides };
      await act(async () => root.render(<AnnotationSummary {...currentProps} />));
    },
    root,
    summary: container.firstElementChild as HTMLElement,
  };
}

function findCountButton(container: HTMLElement) {
  return Array.from(container.querySelectorAll("button")).find(
    (element) => element.textContent?.trim() === "1 annotation",
  );
}

async function hover(element: HTMLElement) {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
  });
}

async function leave(element: HTMLElement) {
  await act(async () => {
    element.dispatchEvent(
      new MouseEvent("mouseout", { bubbles: true, relatedTarget: document.body }),
    );
  });
}
