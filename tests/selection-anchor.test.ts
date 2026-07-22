import { beforeEach, describe, expect, it } from "vitest";

import type { TextAnchor } from "@/features/annotations/annotation";
import {
  rangeEndpointRect,
  rangeStartRect,
  restoreTextAnchorFromIndex,
} from "@/features/annotations/selection-anchor";

describe("selection anchors", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div>
        <p>Deel 是一个 <strong>全球雇佣与薪资合规 SaaS 平台</strong>，核心切入点是 EOR。</p>
      </div>
    `;
  });

  it("restores a range after surrounding markup changes", () => {
    const anchor: TextAnchor = {
      messageId: "assistant-one",
      quote: "全球雇佣与薪资合规 SaaS 平台",
      prefix: "Deel 是一个 ",
      suffix: "，核心切入点是 EOR。",
      start: 8,
      end: 28,
    };
    document.querySelector("strong")?.replaceWith("全球雇佣与薪资合规 SaaS 平台");

    expect(restore(anchor)?.toString()).toBe(anchor.quote);
  });

  it("fails closed for ambiguous repeated quotes without context evidence", () => {
    document.body.innerHTML = `
      <div>
        alpha target beta gamma target delta
      </div>
    `;
    const range = restore({
      messageId: "assistant-one",
      quote: "target",
      prefix: "missing prefix",
      suffix: "missing suffix",
      start: 99,
      end: 105,
    });

    expect(range).toBeNull();
  });

  it("restores a repeated quote only when context identifies one candidate", () => {
    document.body.innerHTML = `
      <div>alpha target beta gamma target delta</div>
    `;
    const range = restore({
      messageId: "assistant-one",
      quote: "target",
      prefix: "gamma ",
      suffix: " delta",
      start: 99,
      end: 105,
    });

    expect(range?.startOffset).toBe(24);
    expect(range?.toString()).toBe("target");
  });

  it("fails closed when repeated candidates tie", () => {
    document.body.innerHTML = `
      <div>same target same target same</div>
    `;

    expect(
      restore({
        messageId: "assistant-one",
        quote: "target",
        prefix: "same ",
        suffix: " same",
        start: 99,
        end: 105,
      }),
    ).toBeNull();
  });

  it("allows a unique quote even when its stored context changed", () => {
    document.body.innerHTML = `
      <div>changed unique phrase changed</div>
    `;

    expect(
      restore({
        messageId: "assistant-one",
        quote: "unique phrase",
        prefix: "old prefix",
        suffix: "old suffix",
        start: 99,
        end: 112,
      })?.toString(),
    ).toBe("unique phrase");
  });

  it("restores a quote that spans multiple text nodes", () => {
    document.body.innerHTML = `
      <div>before unique <strong>phrase</strong> after</div>
    `;

    expect(
      restore({
        messageId: "assistant-one",
        quote: "unique phrase",
        prefix: "before ",
        suffix: " after",
        start: 99,
        end: 112,
      })?.toString(),
    ).toBe("unique phrase");
  });

  it("uses the last visible line as the annotation endpoint", () => {
    const firstLine = new DOMRect(40, 80, 240, 20);
    const lastLine = new DOMRect(40, 104, 90, 20);
    const range = {
      getBoundingClientRect: () => new DOMRect(40, 80, 240, 44),
      getClientRects: () => [firstLine, lastLine, new DOMRect(130, 124, 0, 0)],
    } as unknown as Range;

    expect(rangeEndpointRect(range)).toBe(lastLine);
  });

  it("uses the first visible fragment as the native toolbar anchor", () => {
    const firstFragment = new DOMRect(40, 80, 120, 20);
    const range = {
      getBoundingClientRect: () => new DOMRect(40, 80, 600, 44),
      getClientRects: () => [
        new DOMRect(40, 80, 0, 0),
        firstFragment,
        new DOMRect(40, 104, 240, 20),
      ],
    } as unknown as Range;

    expect(rangeStartRect(range)).toBe(firstFragment);
  });
});

function restore(anchor: TextAnchor) {
  const message = document.body.firstElementChild;
  if (!(message instanceof HTMLElement)) {
    throw new Error("Expected message fixture");
  }
  return restoreTextAnchorFromIndex(anchor, new Map([[anchor.messageId, message]]));
}
