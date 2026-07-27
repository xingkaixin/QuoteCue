import type { Host, NativeSelectionAction } from "@/features/host-port/host-port";

export function requiredElement<T extends Element>(selector: string, root: ParentNode = document) {
  const element = root.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Fixture is missing ${selector}`);
  }
  return element;
}

export function requiredNativeAction(host: Host): NativeSelectionAction {
  if (host.selection.presentation !== "native-toolbar") {
    throw new Error("Expected native selection actions");
  }
  return host.selection.nativeAction;
}

export function setElementRect(element: Element, rect: DOMRect) {
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => rect,
  });
}
