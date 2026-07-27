import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DraftPersistenceStatus } from "@/features/annotations/DraftPersistenceStatus";

afterEach(() => document.body.replaceChildren());

describe("DraftPersistenceStatus", () => {
  it("announces loading without offering an unavailable action", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => root.render(<DraftPersistenceStatus status="loading" />));

    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      "Restoring QuoteCue draft",
    );
    expect(container.querySelector("button")).toBeNull();

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
