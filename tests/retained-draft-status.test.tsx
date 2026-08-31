import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";

import { RetainedDraftStatus } from "@/features/annotations/RetainedDraftStatus";
import type { RetainedDraftState } from "@/features/annotations/use-draft-annotations";

it("requires discard confirmation and reserves failed restoration for retry", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const onRestore = vi.fn();
  const onDiscard = vi.fn();
  const render = (
    status: RetainedDraftState["status"],
    isSending = false,
    capacityExceeded = false,
  ) =>
    act(async () =>
      root.render(
        <RetainedDraftStatus
          state={{
            conversationIdentity: { kind: "unidentified", sessionKey: "source" },
            count: 1,
            status,
          }}
          isSending={isSending}
          capacityExceeded={capacityExceeded}
          onRestore={onRestore}
          onDiscard={onDiscard}
        />,
      ),
    );
  try {
    await render("retained", true);
    const [restore, discard] = [...container.querySelectorAll("button")];
    expect(restore!.disabled).toBe(true);
    expect(discard!.disabled).toBe(true);
    await render("retained", false, true);
    expect(container.textContent).toContain("This draft is full");
    expect(discard!.disabled).toBe(false);
    discard!.focus();
    await act(async () => discard!.click());
    expect(onDiscard).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(discard);
    expect(discard!.textContent).toBe("Confirm discard");
    await act(async () => discard!.click());
    expect(onDiscard).toHaveBeenCalledOnce();

    await render("restoring");
    expect(restore!.disabled).toBe(true);
    expect(discard!.disabled).toBe(true);
    await render("save-failed");
    expect(container.textContent).toContain("original destination");
    expect(restore!.textContent).toBe("Retry saving");
    expect(discard!.disabled).toBe(true);
    await act(async () => restore!.click());
    expect(onRestore).toHaveBeenCalledOnce();
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
