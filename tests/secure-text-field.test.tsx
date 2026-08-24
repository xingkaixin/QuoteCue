import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SecureTextField } from "@/features/secure-field/SecureTextField";
import { I18nProvider, useI18n } from "@/features/i18n/I18nProvider";

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
  document.documentElement.lang = "";
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
  document.documentElement.lang = "";
  vi.restoreAllMocks();
});

describe("SecureTextField", () => {
  it("waits for the extension document before transferring a port", async () => {
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
    iframe.setAttribute("srcdoc", "");

    await act(async () => iframe.dispatchEvent(new Event("load")));

    expect(iframe.hasAttribute("srcdoc")).toBe(false);
    expect(postMessage).not.toHaveBeenCalled();
    expect(FakeMessageChannel.instances).toHaveLength(0);

    markExtensionFrameLoaded(iframe);
    await act(async () => iframe.dispatchEvent(new Event("load")));

    const channel = FakeMessageChannel.instances[0];
    expect(iframe.src).not.toContain("private annotation");
    expect(channel).toBeDefined();
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "quotecue:secure-field:init",
        config: expect.objectContaining({
          name: "quotecue-annotation-comment",
          theme: "light",
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

    await act(async () => {
      root.render(
        <SecureTextField
          ariaLabel="Renamed field"
          kind="input"
          maxLength={32}
          name="renamed-field"
          onCancel={vi.fn()}
          onChange={onChange}
          onSave={onSave}
          placeholder="Updated placeholder"
          value="updated annotation"
        />,
      );
    });
    const updatedIframe = container.querySelector("iframe");
    if (!updatedIframe?.contentWindow) {
      throw new Error("Expected updated secure field iframe");
    }
    const updatedPostMessage = vi
      .spyOn(updatedIframe.contentWindow, "postMessage")
      .mockImplementation(() => {});
    markExtensionFrameLoaded(updatedIframe);
    await act(async () => updatedIframe.dispatchEvent(new Event("load")));

    expect(updatedIframe).not.toBe(iframe);
    expect(updatedPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          kind: "input",
          maxLength: 32,
          name: "renamed-field",
        }),
      }),
      "https://extension.test",
      [FakeMessageChannel.instances[1]?.port2],
    );

    window.removeEventListener("message", onWindowMessage);
    await act(async () => root.unmount());
  });

  it("updates the isolated field when the host language changes", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => root.render(<LocalizedSecureTextField />));
    const iframe = container.querySelector("iframe");
    if (!iframe?.contentWindow) {
      throw new Error("Expected secure field iframe");
    }
    vi.spyOn(iframe.contentWindow, "postMessage").mockImplementation(() => {});
    markExtensionFrameLoaded(iframe);
    await act(async () => iframe.dispatchEvent(new Event("load")));

    const channel = FakeMessageChannel.instances[0];
    const receive = vi.fn();
    if (!channel) {
      throw new Error("Expected secure field channel");
    }
    channel.port2.onmessage = (event) => receive(event.data);

    await act(async () => {
      document.documentElement.lang = "ja";
      await Promise.resolve();
    });

    expect(iframe.lang).toBe("ja");
    expect(receive).toHaveBeenCalledWith({
      type: "update",
      update: expect.objectContaining({
        ariaLabel: "注釈の内容",
        lang: "ja",
        placeholder: "任意のコメントを追加…",
      }),
    });

    await act(async () => root.unmount());
  });
});

function LocalizedSecureTextField() {
  return (
    <I18nProvider>
      <LocalizedField />
    </I18nProvider>
  );
}

function markExtensionFrameLoaded(iframe: HTMLIFrameElement) {
  Object.defineProperty(iframe, "contentDocument", { configurable: true, value: null });
}

function LocalizedField() {
  const { messages } = useI18n();
  return (
    <SecureTextField
      ariaLabel={messages.annotationContent}
      kind="textarea"
      name="quotecue-annotation-comment"
      onCancel={vi.fn()}
      onChange={vi.fn()}
      onSave={vi.fn()}
      placeholder={messages.optionalComment}
      value=""
    />
  );
}

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
