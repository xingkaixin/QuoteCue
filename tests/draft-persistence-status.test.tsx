import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DraftPersistenceStatus } from "@/features/annotations/DraftPersistenceStatus";

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe("DraftPersistenceStatus", () => {
  it("delays loading without offering an unavailable action or live announcement", async () => {
    vi.useFakeTimers();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => root.render(<DraftPersistenceStatus status="loading" />));

    expect(container.childElementCount).toBe(0);
    await act(async () => vi.advanceTimersByTimeAsync(199));
    expect(container.childElementCount).toBe(0);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(container.textContent).toContain("Restoring QuoteCue draft");
    expect(container.querySelector("[aria-live], [role=status]")).toBeNull();
    expect(container.querySelector("button")).toBeNull();

    await act(async () => root.unmount());
  });

  it("shows errors immediately and cancels the delay when loading ends", async () => {
    vi.useFakeTimers();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => root.render(<DraftPersistenceStatus status="loading" />));
    await act(async () => vi.advanceTimersByTimeAsync(100));
    await act(async () =>
      root.render(
        <DraftPersistenceStatus
          annotations={[]}
          hasUnreadableAnnotations={false}
          operation="load"
          onRetry={vi.fn()}
          status="error"
        />,
      ),
    );
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      "couldn't restore this draft",
    );
    expect(container.querySelector('[aria-live="polite"]')).not.toBeNull();

    await act(async () => root.render(<DraftPersistenceStatus status="loading" />));
    await act(async () => vi.advanceTimersByTimeAsync(199));
    expect(container.childElementCount).toBe(0);
    await act(async () => root.render(null));
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(container.childElementCount).toBe(0);

    await act(async () => root.render(<DraftPersistenceStatus status="loading" />));
    await act(async () => vi.advanceTimersByTimeAsync(199));
    expect(container.childElementCount).toBe(0);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(container.textContent).toContain("Restoring QuoteCue draft");
    await act(async () => root.unmount());
  });

  it("offers a confirmed clear action for wholly unreadable drafts", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const onClear = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () =>
      root.render(
        <DraftPersistenceStatus
          status="ready"
          annotations={[]}
          hasUnreadableAnnotations
          onClear={onClear}
        />,
      ),
    );
    expect(container.textContent).toContain("Some annotations cannot be read");
    const button = container.querySelector("button")!;
    button.focus();
    await act(async () => button.click());
    expect(onClear).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(button);
    expect(button.getAttribute("aria-label")).toBe("Confirm clearing all annotations");
    await act(async () => button.click());
    expect(onClear).toHaveBeenCalledOnce();
    await act(async () => root.unmount());
  });

  it("explains a save failure and retries on request", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const onRetry = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () =>
      root.render(
        <DraftPersistenceStatus
          annotations={[]}
          hasUnreadableAnnotations={false}
          operation="save"
          onRetry={onRetry}
          status="error"
        />,
      ),
    );
    expect(container.textContent).toContain("couldn't save these annotations");

    await act(async () => container.querySelector("button")?.click());
    expect(onRetry).toHaveBeenCalledOnce();

    await act(async () => root.unmount());
  });
});
