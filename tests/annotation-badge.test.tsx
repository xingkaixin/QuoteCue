import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PortalContainerProvider } from "@/components/ui/portal-container";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AnnotationBadge } from "@/features/annotations/AnnotationBadge";

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

describe("AnnotationBadge", () => {
  it("does not expose a tooltip when the annotation has no comment", async () => {
    const { badge, container, onEdit, root } = await mountBadge();
    await act(async () => badge?.focus());

    expect(container.textContent).not.toContain("No comment added");
    expect(container.querySelector('[role="tooltip"]')).toBeNull();
    await act(async () => badge?.click());
    expect(onEdit).toHaveBeenCalledWith(annotation);

    await act(async () => root.unmount());
  });

  it("shows the comment in a tooltip when content exists", async () => {
    const { badge, container, root } = await mountBadge("Make this more specific");

    await act(async () => badge?.focus());

    expect(container.textContent).toContain("Make this more specific");

    await act(async () => root.unmount());
  });
});

async function mountBadge(comment = "") {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const onEdit = vi.fn();

  await act(async () => {
    root.render(
      <PortalContainerProvider container={container}>
        <TooltipProvider delay={0}>
          <AnnotationBadge
            entry={{ annotation: { ...annotation, comment }, ordinal: 1 }}
            left={10}
            onEdit={onEdit}
            top={10}
          />
        </TooltipProvider>
      </PortalContainerProvider>,
    );
  });

  return {
    badge: container.querySelector<HTMLButtonElement>("button"),
    container,
    onEdit,
    root,
  };
}
