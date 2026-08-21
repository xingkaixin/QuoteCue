import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { useConversationIdentity } from "@/features/annotations/use-conversation-identity";

import { createFakeHost, type FakeHost } from "./fixtures/fake-host";
import { HostTestProvider } from "./fixtures/host-provider";

afterEach(() => {
  window.history.replaceState({}, "", "/");
  document.body.replaceChildren();
});

describe("useConversationIdentity", () => {
  it("keeps new chat instances separate and converges on a URL conversation id", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    window.history.replaceState({}, "", "/");
    const firstContainer = document.createElement("div");
    const secondContainer = document.createElement("div");
    document.body.append(firstContainer, secondContainer);
    const firstRoot = createRoot(firstContainer);
    const secondRoot = createRoot(secondContainer);
    const firstHost = createFakeHost();
    const secondHost = createFakeHost();

    await act(async () => {
      firstRoot.render(<ConversationIdentityProbe host={firstHost} />);
      secondRoot.render(<ConversationIdentityProbe host={secondHost} />);
    });
    const firstIdentity = readIdentity(firstContainer);
    const secondIdentity = readIdentity(secondContainer);
    expect(firstIdentity.kind).toBe("unidentified");
    expect(secondIdentity.kind).toBe("unidentified");
    expect(firstIdentity.value).not.toBe(secondIdentity.value);

    await act(async () => {
      firstHost.controls.setConversationIdentity({
        kind: "identified",
        id: "conversation-a",
        siteId: "chatgpt",
      });
      secondHost.controls.setConversationIdentity({
        kind: "identified",
        id: "conversation-a",
        siteId: "chatgpt",
      });
    });
    expect(readIdentity(firstContainer)).toEqual({
      kind: "identified",
      value: "conversation-a",
    });
    expect(readIdentity(secondContainer)).toEqual({
      kind: "identified",
      value: "conversation-a",
    });

    await act(async () => {
      firstRoot.unmount();
      secondRoot.unmount();
    });
  });
});

function ConversationIdentityProbe({ host }: { host: FakeHost }) {
  return (
    <HostTestProvider host={host}>
      <ConversationIdentityValue />
    </HostTestProvider>
  );
}

function ConversationIdentityValue() {
  const identity = useConversationIdentity();
  return (
    <output data-kind={identity.kind}>
      {identity.kind === "identified" ? identity.id : identity.sessionKey}
    </output>
  );
}

function readIdentity(container: HTMLElement) {
  const output = container.querySelector("output");
  return {
    kind: output?.dataset.kind,
    value: output?.textContent,
  };
}
