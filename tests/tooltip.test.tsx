import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

afterEach(() => {
  document.body.replaceChildren();
});

describe("TooltipContent", () => {
  it("keeps the portal inside the QuoteCue shadow root", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const host = document.createElement("quotecue-ui");
    const shadowRoot = host.attachShadow({ mode: "open" });
    const container = document.createElement("div");
    shadowRoot.append(container);
    document.body.append(host);

    const root = createRoot(container);
    await act(async () => {
      root.render(
        <TooltipProvider>
          <Tooltip open>
            <TooltipTrigger>Trigger</TooltipTrigger>
            <TooltipContent>Tooltip text</TooltipContent>
          </Tooltip>
        </TooltipProvider>,
      );
    });

    expect(shadowRoot.textContent).toContain("Tooltip text");
    expect(document.body.querySelector("[data-quotecue-portal]")).toBeNull();

    await act(async () => root.unmount());
  });
});
