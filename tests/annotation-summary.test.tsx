import type { ComponentProps } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AnnotationSummary } from "@/features/annotations/AnnotationSummary";
import type { DraftAnnotation } from "@/features/annotations/annotation";
import {
  numberAnnotations,
  type ProjectedAnnotation,
} from "@/features/annotations/annotation-projection";
import { DELETE_UNDO_WINDOW_MS } from "@/features/annotations/use-deferred-annotation-deletion";

const annotation = {
  id: "annotation-1",
  anchor: {
    format: "exact" as const,
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
    expect(countButton?.getAttribute("aria-haspopup")).toBe("dialog");
    expect(countButton?.getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector('[role="dialog"]')).toBeNull();

    await hover(summary);

    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog?.classList).toContain("qc-elevated");
    expect(dialog?.getAttribute("aria-label")).toBe("1 annotation");
    expect(countButton?.getAttribute("aria-expanded")).toBe("true");
    expect(container.textContent).toContain("Selected text:");
    expect(container.textContent).toContain("selected text");
    expect(container.textContent).not.toContain("User comment:");
    expect(container.textContent).not.toContain("No comment added");
    const editButton = container.querySelector<HTMLButtonElement>(
      '[aria-label="Edit annotation 1"]',
    );
    expect(editButton?.type).toBe("button");
    expect(editButton?.disabled).toBe(false);
    expect(document.activeElement).not.toBe(editButton);

    await leave(summary);
    expect(container.querySelector('[role="dialog"]')).toBeNull();

    await act(async () => root.unmount());
  });

  it("shows the comment section only when the annotation has content", async () => {
    const commentedAnnotation = { ...annotation, comment: "Make this more specific" };
    const { container, root, summary } = await mountSummary({
      annotations: projectAnnotations([commentedAnnotation]),
    });

    await hover(summary);

    expect(container.textContent).toContain("User comment:");
    expect(container.textContent).toContain("Make this more specific");

    await act(async () => root.unmount());
  });

  it("keeps the popover and focus when the pointer leaves a focused control", async () => {
    const { container, root, summary } = await mountSummary();
    await hover(summary);
    const editButton = container.querySelector<HTMLButtonElement>(
      '[aria-label="Edit annotation 1"]',
    );
    await act(async () => editButton?.focus());
    await leave(summary);
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(document.activeElement).toBe(editButton);

    const outsideButton = document.createElement("button");
    document.body.append(outsideButton);
    await act(async () => outsideButton.focus());
    expect(container.querySelector('[role="dialog"]')).toBeNull();

    await hover(summary);
    await act(async () => findCountButton(container)?.focus());
    await act(async () => outsideButton.focus());
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    await leave(summary);
    expect(container.querySelector('[role="dialog"]')).toBeNull();

    await act(async () => root.unmount());
  });

  it("shows rendered selection text when DOM text omits layout separators", async () => {
    const tableAnnotation = {
      ...annotation,
      anchor: { ...annotation.anchor, displayQuote: "alpha beta", quote: "alphabeta" },
    };
    const { container, root, summary } = await mountSummary({
      annotations: projectAnnotations([tableAnnotation]),
    });

    await hover(summary);

    expect(container.textContent).toContain("alpha beta");
    expect(container.textContent).not.toContain("alphabeta");

    await act(async () => root.unmount());
  });

  it("opens controls from the keyboard and restores focus on Escape", async () => {
    const onEdit = vi.fn();
    const { container, root, summary } = await mountSummary({ onEdit });
    const countButton = findCountButton(container);
    const clearButton = container.querySelector<HTMLButtonElement>(
      '[aria-label="Clear all annotations"]',
    );

    expect(clearButton).not.toBeNull();
    expect(clearButton?.type).toBe("button");
    expect(clearButton?.tabIndex).toBe(0);
    expect(clearButton?.disabled).toBe(false);
    expect(countButton?.getAttribute("aria-expanded")).toBe("false");

    await act(async () => clearButton?.focus());
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(countButton?.getAttribute("aria-expanded")).toBe("true");

    const editButton = container.querySelector<HTMLButtonElement>(
      '[aria-label="Edit annotation 1"]',
    );
    expect(editButton).not.toBeNull();
    expect(editButton?.tabIndex).toBe(0);
    await act(async () => editButton?.click());
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ annotation }));

    await hover(summary);
    await act(async () => {
      editButton?.focus();
      editButton?.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
    });
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(countButton);

    await leave(summary);
    await act(async () => countButton?.click());
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    await act(async () => root.unmount());
  });

  it("keeps deletion and clear controls enabled while an undo batch is pending", async () => {
    const onRemove = vi.fn();
    const mounted = await mountSummary({
      annotations: projectAnnotations([annotation, secondAnnotation]),
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
      annotations: projectAnnotations([secondAnnotation]),
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
      annotations: projectAnnotations([annotation]),
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
      annotations: [projectAnnotation(annotation, 1, false)],
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

  it("does not report a pending projection as an unavailable source", async () => {
    const { container, root, summary } = await mountSummary({
      annotations: [{ annotation, ordinal: 1, resolution: "pending" }],
    });

    await hover(summary);

    expect(container.textContent).not.toContain("Source position changed");
    expect(
      container.querySelector<HTMLButtonElement>('[aria-label="Edit annotation 1"]')?.disabled,
    ).toBe(true);

    await act(async () => root.unmount());
  });

  it("uses the supplied ordinal for every numbered control", async () => {
    const { container, root, summary } = await mountSummary({
      annotations: [projectAnnotation(annotation, 7)],
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
    annotations: projectAnnotations([annotation]),
    onClear: vi.fn(),
    onEdit: vi.fn(),
    onRemove: vi.fn(),
    onUndo: vi.fn(),
    pendingDeletionCount: 0,
    pendingDeletionExpiresAt: null,
    position: { left: 10, top: 10 },
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

function projectAnnotations(annotations: readonly DraftAnnotation[]): ProjectedAnnotation[] {
  return numberAnnotations(annotations).map(({ annotation: item, ordinal }) =>
    projectAnnotation(item, ordinal),
  );
}

function projectAnnotation(
  item: DraftAnnotation,
  ordinal: number,
  isResolved = true,
): ProjectedAnnotation {
  if (!isResolved) {
    return { annotation: item, ordinal, resolution: "unresolved" };
  }
  return {
    annotation: item,
    geometry: {
      badge: null,
      range: document.createRange(),
      rect: { bottom: 30, height: 20, left: 10, right: 30, top: 10, width: 20 },
    },
    ordinal,
    resolution: "resolved",
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
