export function readRenderedText(element: HTMLElement) {
  return typeof element.innerText === "string" ? element.innerText : (element.textContent ?? "");
}
