import { beforeEach, describe, expect, it } from "vitest";

import type { TextAnchor } from "@/features/annotations/annotation";
import {
  captureAssistantSelection,
  restoreTextAnchor,
} from "@/features/annotations/selection-anchor";

describe("selection anchors", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div data-message-author-role="assistant" data-message-id="assistant-one">
        <p>Deel 是一个 <strong>全球雇佣与薪资合规 SaaS 平台</strong>，核心切入点是 EOR。</p>
      </div>
    `;
    window.getSelection()?.removeAllRanges();
  });

  it("captures a selection inside an assistant message", () => {
    const text = document.querySelector("strong")?.firstChild;
    if (!text) {
      throw new Error("Expected selection text node");
    }

    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 4);
    window.getSelection()?.addRange(range);

    const draft = captureAssistantSelection();

    expect(draft?.anchor).toMatchObject({
      messageId: "assistant-one",
      quote: "全球雇佣",
    });
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

    expect(restoreTextAnchor(anchor)?.toString()).toBe(anchor.quote);
  });

  it("does not capture selections spanning different messages", () => {
    document.body.insertAdjacentHTML(
      "beforeend",
      '<div data-message-author-role="assistant" data-message-id="assistant-two">第二条回复</div>',
    );
    const firstText = document.querySelector('[data-message-id="assistant-one"]')?.firstChild;
    const secondText = document.querySelector('[data-message-id="assistant-two"]')?.firstChild;
    if (!firstText || !secondText) {
      throw new Error("Expected message text nodes");
    }

    const range = document.createRange();
    range.setStart(firstText, 0);
    range.setEnd(secondText, 2);
    window.getSelection()?.addRange(range);

    expect(captureAssistantSelection()).toBeNull();
  });

  it("fails closed for ambiguous repeated quotes without context evidence", () => {
    document.body.innerHTML = `
      <div data-message-author-role="assistant" data-message-id="assistant-one">
        alpha target beta gamma target delta
      </div>
    `;
    const range = restoreTextAnchor({
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
      <div data-message-author-role="assistant" data-message-id="assistant-one">alpha target beta gamma target delta</div>
    `;
    const range = restoreTextAnchor({
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
      <div data-message-author-role="assistant" data-message-id="assistant-one">same target same target same</div>
    `;

    expect(
      restoreTextAnchor({
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
      <div data-message-author-role="assistant" data-message-id="assistant-one">changed unique phrase changed</div>
    `;

    expect(
      restoreTextAnchor({
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
      <div data-message-author-role="assistant" data-message-id="assistant-one">before unique <strong>phrase</strong> after</div>
    `;

    expect(
      restoreTextAnchor({
        messageId: "assistant-one",
        quote: "unique phrase",
        prefix: "before ",
        suffix: " after",
        start: 99,
        end: 112,
      })?.toString(),
    ).toBe("unique phrase");
  });
});
