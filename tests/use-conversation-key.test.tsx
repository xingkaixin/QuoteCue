import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { useConversationKey } from "@/features/annotations/use-conversation-key";

afterEach(() => {
  window.history.replaceState({}, "", "/");
  document.body.replaceChildren();
});

describe("useConversationKey", () => {
  it("keeps new chat instances separate and converges on a URL conversation id", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    window.history.replaceState({}, "", "/");
    const firstContainer = document.createElement("div");
    const secondContainer = document.createElement("div");
    document.body.append(firstContainer, secondContainer);
    const firstRoot = createRoot(firstContainer);
    const secondRoot = createRoot(secondContainer);

    await act(async () => {
      firstRoot.render(<ConversationKeyProbe />);
      secondRoot.render(<ConversationKeyProbe />);
    });
    const firstTemporaryKey = firstContainer.querySelector("output")?.textContent;
    const secondTemporaryKey = secondContainer.querySelector("output")?.textContent;
    expect(firstTemporaryKey).toMatch(/^new-chat:/);
    expect(secondTemporaryKey).toMatch(/^new-chat:/);
    expect(firstTemporaryKey).not.toBe(secondTemporaryKey);

    await act(async () => {
      window.history.replaceState({}, "", "/c/conversation-a");
      document.body.append(document.createElement("span"));
    });
    expect(firstContainer.querySelector("output")?.textContent).toBe("conversation-a");
    expect(secondContainer.querySelector("output")?.textContent).toBe("conversation-a");

    await act(async () => {
      firstRoot.unmount();
      secondRoot.unmount();
    });
  });
});

function ConversationKeyProbe() {
  return <output>{useConversationKey()}</output>;
}
