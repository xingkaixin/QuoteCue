import { vi } from "vitest";

import type { HostResult } from "@/features/host-port/host-port";

export function availableValue<T>(result: HostResult<T>) {
  if (result.status === "unavailable") {
    throw new Error("Expected available host result");
  }
  return result.value;
}

export function requiredText(node: Node | null) {
  if (!node) {
    throw new Error("Expected fixture text");
  }
  const text = node.nodeType === Node.TEXT_NODE ? node : node.firstChild;
  if (!(text instanceof Text)) {
    throw new Error("Expected fixture text");
  }
  return text;
}

export function selectNodeContents(node: Node) {
  const range = document.createRange();
  range.selectNodeContents(node);
  selectRange(range);
}

export function selectRange(range: Range) {
  const selection = window.getSelection();
  if (!selection) {
    throw new Error("Expected document selection");
  }
  selection.removeAllRanges();
  selection.addRange(range);
  return selection;
}

export function clearComposer(composer: HTMLElement) {
  if (composer instanceof HTMLTextAreaElement) {
    composer.value = "";
    return;
  }
  composer.replaceChildren();
}

export function installSyntheticPasteSupport() {
  class FakeDataTransfer {
    private store = new Map<string, string>();

    getData(type: string) {
      return this.store.get(type) ?? "";
    }

    setData(type: string, value: string) {
      this.store.set(type, value);
    }
  }

  class FakeClipboardEvent extends Event {
    clipboardData: FakeDataTransfer | null;

    constructor(type: string, init?: EventInit & { clipboardData?: FakeDataTransfer }) {
      super(type, init);
      this.clipboardData = init?.clipboardData ?? null;
    }
  }

  vi.stubGlobal("DataTransfer", FakeDataTransfer);
  vi.stubGlobal("ClipboardEvent", FakeClipboardEvent);
}

export function missingToolbar(): never {
  throw new Error("Expected a native selection toolbar fixture");
}

export function nextFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

export function selectionRectangle() {
  return { bottom: 220, height: 20, left: 100, right: 360, top: 200, width: 260 };
}
