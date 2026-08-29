import { afterEach, describe, expect, it, vi } from "vitest";

import { createComposerDriver } from "@/features/host/composer-driver";
import { textareaComposer } from "@/features/host/composer-access";
import { createHostContext } from "@/features/host/host-context";
import { pasteFirstDomFallbackComposer } from "@/features/host/rich-text-composer";
import { type ComposerAccess, type SiteAdapter } from "@/features/host/site-adapter";

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("composer driver", () => {
  it("stops after an editor applies the synthetic paste", async () => {
    const execCommand = installExecCommand(false);
    vi.stubGlobal(
      "DataTransfer",
      class {
        setData() {}
      },
    );
    vi.stubGlobal("ClipboardEvent", class extends Event {});
    const composer = installComposer();
    composer.addEventListener("paste", (event) => {
      event.preventDefault();
      composer.textContent = "replacement";
    });

    const composerDriver = driver();
    await expect(
      composerDriver.replaceText(
        availableSnapshot(composerDriver),
        "replacement",
        new AbortController().signal,
      ),
    ).resolves.toBe(true);
    expect(execCommand).not.toHaveBeenCalled();
  });

  it("waits for an accepted insertText command to render", async () => {
    const execCommand = installExecCommand(true);
    vi.stubGlobal("ClipboardEvent", undefined);
    vi.stubGlobal("DataTransfer", undefined);
    const composer = installComposer("original");

    const composerDriver = driver();
    const replaced = composerDriver.replaceText(
      availableSnapshot(composerDriver),
      "replacement",
      new AbortController().signal,
    );
    expect(execCommand).toHaveBeenCalledWith("insertText", false, "replacement");
    expect(composer.textContent).toBe("original");
    composer.textContent = "replacement";
    await expect(replaced).resolves.toBe(true);
  });

  it("falls back to replacing children and dispatching input", async () => {
    installExecCommand(false);
    vi.stubGlobal("ClipboardEvent", undefined);
    vi.stubGlobal("DataTransfer", undefined);
    const composer = installComposer("original");
    const onInput = vi.fn();
    composer.addEventListener("input", onInput);

    const composerDriver = driver();
    await expect(
      composerDriver.replaceText(
        availableSnapshot(composerDriver),
        "replacement",
        new AbortController().signal,
      ),
    ).resolves.toBe(true);
    expect(composer.innerHTML).toBe("<p>replacement</p>");
    expect(onInput).toHaveBeenCalledOnce();
  });

  it("writes textarea values without entering the rich-text fallback ladder", async () => {
    const execCommand = installExecCommand(true);
    const composer = document.createElement("textarea");
    document.body.append(composer);

    const composerDriver = driver(textareaComposer("textarea"));
    await expect(
      composerDriver.replaceText(
        availableSnapshot(composerDriver),
        "replacement",
        new AbortController().signal,
      ),
    ).resolves.toBe(true);
    expect(composer.value).toBe("replacement");
    expect(execCommand).not.toHaveBeenCalled();
  });
});

function driver(composer = pasteFirstDomFallbackComposer("[contenteditable]")) {
  const hostAdapter = adapter(composer);
  return createComposerDriver(createHostContext({ document, window }, hostAdapter));
}

function availableSnapshot(composerDriver: ReturnType<typeof createComposerDriver>) {
  const result = composerDriver.snapshot();
  if (result.status === "unavailable") {
    throw new Error("Expected an available composer snapshot");
  }
  return result.value;
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

function adapter(composer: ComposerAccess): SiteAdapter {
  return {
    composer,
    conversationId: () => null,
    layout: { actionSelector: "button", surfaceSelector: "[data-composer-surface]" },
    messages: {
      assistantSelector: "article",
      id: (message) => message.id,
      isAssistant: () => true,
      userSelector: "[data-user]",
    },
    selectionPresentation: { mode: "overlay" },
    sendControl: { isDisabled: () => false, selector: "button" },
  };
}
