import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SecureTextField } from "@/features/annotations/SecureTextField";

vi.mock("wxt/browser", () => ({
  browser: {
    runtime: {
      getURL: () => "https://extension.test/secure-field.html",
    },
  },
}));

const originalMessageChannel = globalThis.MessageChannel;

beforeEach(() => {
  FakeMessageChannel.instances = [];
  Object.defineProperty(globalThis, "MessageChannel", {
    configurable: true,
    value: FakeMessageChannel,
  });
});

afterEach(() => {
  Object.defineProperty(globalThis, "MessageChannel", {
    configurable: true,
    value: originalMessageChannel,
  });
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("SecureTextField", () => {
  it("uses a transferred port instead of page window messages", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const onChange = vi.fn();
    const onSave = vi.fn();
    const onWindowMessage = vi.fn();
    window.addEventListener("message", onWindowMessage);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <SecureTextField
          ariaLabel="Annotation content"
          kind="textarea"
          name="quotecue-annotation-comment"
          onCancel={vi.fn()}
          onChange={onChange}
          onSave={onSave}
          placeholder="Add a comment"
          value="private annotation"
        />,
      );
    });
    const iframe = container.querySelector("iframe");
    if (!iframe?.contentWindow) {
      throw new Error("Expected secure field iframe");
    }
    const postMessage = vi.spyOn(iframe.contentWindow, "postMessage").mockImplementation(() => {});

    await act(async () => iframe.dispatchEvent(new Event("load")));

    const channel = FakeMessageChannel.instances[0];
    expect(iframe.src).not.toContain("private annotation");
    expect(channel).toBeDefined();
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "quotecue:secure-field:init",
        config: expect.objectContaining({
          name: "quotecue-annotation-comment",
          value: "private annotation",
        }),
      }),
      "https://extension.test",
      [channel?.port2],
    );
    expect(iframe.getAttribute("sandbox")).toBe("allow-same-origin allow-scripts");

    channel?.port2.postMessage({ type: "change", value: "updated annotation" });
    channel?.port2.postMessage({ type: "save", value: "updated annotation" });
    expect(onChange).toHaveBeenCalledWith("updated annotation");
    expect(onSave).toHaveBeenCalledWith("updated annotation");
    expect(onWindowMessage).not.toHaveBeenCalled();

    window.removeEventListener("message", onWindowMessage);
    await act(async () => root.unmount());
  });
});

class FakeMessagePort {
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  peer: FakeMessagePort | null = null;

  close() {}

  postMessage(data: unknown) {
    this.peer?.onmessage?.({ data } as MessageEvent<unknown>);
  }

  start() {}
}

class FakeMessageChannel {
  static instances: FakeMessageChannel[] = [];
  port1 = new FakeMessagePort();
  port2 = new FakeMessagePort();

  constructor() {
    this.port1.peer = this.port2;
    this.port2.peer = this.port1;
    FakeMessageChannel.instances.push(this);
  }
}
