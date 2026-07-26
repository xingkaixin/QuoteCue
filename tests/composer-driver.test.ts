import { afterEach, describe, expect, it, vi } from "vitest";

import { createComposerDriver } from "@/features/host/composer-driver";
import { createHostContext, type SiteAdapter } from "@/features/host/host-context";
import { createTextNormalizer } from "@/features/host/text-normalizer";

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("composer driver", () => {
  it("stops after an editor accepts the synthetic paste", () => {
    const execCommand = installExecCommand(false);
    vi.stubGlobal(
      "DataTransfer",
      class {
        setData() {}
      },
    );
    vi.stubGlobal("ClipboardEvent", class extends Event {});
    const composer = installComposer();
    composer.addEventListener("paste", (event) => event.preventDefault());

    expect(driver().replaceText(composer, "replacement")).toBe(true);
    expect(execCommand).not.toHaveBeenCalled();
  });

  it("trusts an accepted insertText command before asynchronous rendering", () => {
    const execCommand = installExecCommand(true);
    vi.stubGlobal("ClipboardEvent", undefined);
    vi.stubGlobal("DataTransfer", undefined);
    const composer = installComposer("original");

    expect(driver().replaceText(composer, "replacement")).toBe(true);
    expect(execCommand).toHaveBeenCalledWith("insertText", false, "replacement");
    expect(composer.textContent).toBe("original");
  });

  it("falls back to replacing children and dispatching input", () => {
    installExecCommand(false);
    vi.stubGlobal("ClipboardEvent", undefined);
    vi.stubGlobal("DataTransfer", undefined);
    const composer = installComposer("original");
    const onInput = vi.fn();
    composer.addEventListener("input", onInput);

    expect(driver().replaceText(composer, "replacement")).toBe(true);
    expect(composer.innerHTML).toBe("<p>replacement</p>");
    expect(onInput).toHaveBeenCalledOnce();
  });
});

function driver() {
  const hostAdapter = adapter();
  return createComposerDriver(
    createHostContext({ document, window }, hostAdapter),
    createTextNormalizer(hostAdapter),
  );
}

function installComposer(text = "") {
  const composer = document.createElement("div");
  composer.setAttribute("contenteditable", "true");
  composer.textContent = text;
  document.body.append(composer);
  return composer;
}

function installExecCommand(result: boolean) {
  const execCommand = vi.fn(() => result);
  Object.defineProperty(document, "execCommand", { configurable: true, value: execCommand });
  return execCommand;
}

function adapter(): SiteAdapter {
  return {
    assistantMessageSelector: "article",
    composerButtonSelector: "button",
    composerKind: "contenteditable",
    composerSelector: "[contenteditable]",
    conversationPathPattern: /^\/c\/([^/]+)/,
    selectionActionMode: "overlay",
    sendButtonSelector: "button",
    userMessageSelector: "[data-user]",
    messageId: (message) => message.id,
  };
}
