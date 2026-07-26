import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { PortalContainerProvider } from "@/components/ui/portal-container";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

afterEach(() => {
  document.body.replaceChildren();
});

describe("TooltipContent", () => {
  it("keeps the portal inside the QuoteCue shadow root", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const host = document.createElement("quotecue-ui");
    const shadowRoot = host.attachShadow({ mode: "closed" });
    const container = document.createElement("div");
    shadowRoot.append(container);
    document.body.append(host);

    const root = createRoot(container);
    await act(async () => {
      root.render(
        <PortalContainerProvider container={container}>
          <TooltipProvider>
            <Tooltip open>
              <TooltipTrigger>Trigger</TooltipTrigger>
              <TooltipContent>Tooltip text</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </PortalContainerProvider>,
      );
    });

    expect(host.shadowRoot).toBeNull();
    expect(shadowRoot.textContent).toContain("Tooltip text");
    const portal = Array.from(container.children).find(
      (child) => child.textContent === "Tooltip text",
    );
    expect(portal?.parentElement).toBe(container);
    expect(portal?.getRootNode()).toBe(shadowRoot);

    await act(async () => root.unmount());
  });
});
