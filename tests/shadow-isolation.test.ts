import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => document.body.replaceChildren());

describe("QuoteCue UI isolation", () => {
  it("keeps annotation content and controls outside the page DOM", () => {
    const host = document.createElement("quotecue-ui");
    const shadowRoot = host.attachShadow({ mode: "closed" });
    const annotation = document.createElement("p");
    annotation.textContent = "private annotation";
    const sendButton = document.createElement("button");
    const onSend = vi.fn();
    sendButton.addEventListener("click", onSend);
    shadowRoot.append(annotation, sendButton);
    document.body.append(host);

    expect(host.shadowRoot).toBeNull();
    expect(document.body.textContent).not.toContain("private annotation");
    expect(document.querySelector("quotecue-ui button")).toBeNull();

    host.click();
    expect(onSend).not.toHaveBeenCalled();
  });

  it("keeps composed field events inside their iframe document", () => {
    const iframe = document.createElement("iframe");
    document.body.append(iframe);
    const field = iframe.contentDocument?.createElement("input");
    if (!field || !iframe.contentDocument?.body) {
      throw new Error("Expected iframe document");
    }
    iframe.contentDocument.body.append(field);
    let capturedData: string | null = null;
    document.addEventListener(
      "input",
      (event) => {
        capturedData = event instanceof InputEvent ? event.data : null;
      },
      { capture: true, once: true },
    );

    field.dispatchEvent(
      new InputEvent("input", { bubbles: true, composed: true, data: "private annotation" }),
    );

    expect(capturedData).toBeNull();
  });
});
