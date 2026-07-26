import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  SECURE_FIELD_INIT,
  type SecureFieldConfig,
} from "@/features/annotations/secure-field-protocol";

const TOKEN = "frame-token";
const config = {
  ariaLabel: "Annotation content",
  kind: "textarea",
  name: "quotecue-annotation-comment",
  placeholder: "Add a comment",
  theme: "dark",
  value: "private annotation",
} satisfies SecureFieldConfig;

beforeEach(() => {
  vi.resetModules();
  window.history.replaceState({}, "", `/#${TOKEN}`);
  document.body.replaceChildren();
  delete document.documentElement.dataset.theme;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
  delete document.documentElement.dataset.theme;
});

describe("secure field frame", () => {
  it("accepts a valid init after rejecting the wrong token", async () => {
    await bootstrapSecureField();
    const rejectedPort = new FakeMessagePort();

    dispatchInit(rejectedPort, { token: "wrong-token" });

    expect(rejectedPort.start).not.toHaveBeenCalled();
    expect(document.body.children).toHaveLength(0);

    const acceptedPort = new FakeMessagePort();
    dispatchInit(acceptedPort);

    expect(acceptedPort.postMessage).toHaveBeenCalledWith({ type: "ready" });
    expect(document.querySelector("textarea")).not.toBeNull();
  });

  it("rejects init messages from outside the parent window", async () => {
    await bootstrapSecureField();
    const foreignFrame = document.createElement("iframe");
    document.body.append(foreignFrame);
    const source = foreignFrame.contentWindow;
    if (!source) {
      throw new Error("Expected a foreign window");
    }
    const rejectedPort = new FakeMessagePort();

    dispatchInit(rejectedPort, { source });

    expect(rejectedPort.start).not.toHaveBeenCalled();
    expect(rejectedPort.postMessage).not.toHaveBeenCalled();

    const acceptedPort = new FakeMessagePort();
    dispatchInit(acceptedPort);
    expect(acceptedPort.postMessage).toHaveBeenCalledWith({ type: "ready" });
  });

  it("renders the configured field and announces readiness", async () => {
    await bootstrapSecureField();
    const port = new FakeMessagePort();

    dispatchInit(port);

    const field = secureField();
    expect(field).toMatchObject({
      ariaLabel: config.ariaLabel,
      name: config.name,
      placeholder: config.placeholder,
      value: config.value,
    });
    expect(field.autocomplete).toBe("off");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.activeElement).toBe(field);
    expect(port.start).toHaveBeenCalledOnce();
    expect(port.postMessage).toHaveBeenCalledWith({ type: "ready" });
  });

  it("sends change, cancel, and save events through the port", async () => {
    await bootstrapSecureField();
    const port = new FakeMessagePort();
    dispatchInit(port);
    const field = secureField();
    field.value = "updated annotation";

    field.dispatchEvent(new Event("input"));
    const escape = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Escape",
    });
    field.dispatchEvent(escape);
    const save = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      key: "Enter",
    });
    field.dispatchEvent(save);

    expect(escape.defaultPrevented).toBe(true);
    expect(save.defaultPrevented).toBe(true);
    expect(port.postMessage.mock.calls.map(([message]) => message)).toEqual([
      { type: "ready" },
      { type: "change", value: "updated annotation" },
      { type: "cancel" },
      { type: "save", value: "updated annotation" },
    ]);
  });

  it("applies value, theme, and focus commands from the port", async () => {
    await bootstrapSecureField();
    const port = new FakeMessagePort();
    dispatchInit(port);
    const field = secureField();
    const focus = vi.spyOn(field, "focus");

    port.receive({ type: "set-value", value: "remote value" });
    port.receive({ type: "set-theme", theme: "light" });
    port.receive({ type: "focus" });

    expect(field.value).toBe("remote value");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(focus).toHaveBeenCalledOnce();
  });
});

async function bootstrapSecureField() {
  await import("@/entrypoints/secure-field/main");
}

function dispatchInit(
  port: FakeMessagePort,
  overrides: { source?: MessageEventSource; token?: string } = {},
) {
  window.dispatchEvent(
    new MessageEvent("message", {
      data: {
        type: SECURE_FIELD_INIT,
        token: overrides.token ?? TOKEN,
        config,
      },
      ports: [port as unknown as MessagePort],
      source: overrides.source ?? window.parent,
    }),
  );
}

function secureField() {
  const field = document.querySelector("textarea");
  if (!(field instanceof HTMLTextAreaElement)) {
    throw new Error("Expected a secure textarea");
  }
  return field;
}

class FakeMessagePort {
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  postMessage = vi.fn<(data: unknown) => void>();
  start = vi.fn();

  receive(data: unknown) {
    this.onmessage?.(new MessageEvent("message", { data }));
  }
}
