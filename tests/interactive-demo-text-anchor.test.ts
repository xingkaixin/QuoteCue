import { describe, expect, it } from "vitest";

import {
  captureDemoTextAnchor,
  restoreDemoTextAnchor,
} from "../website/src/components/interactive-demo-text-anchor";

describe("interactive demo text anchor", () => {
  it("restores trimmed text after the transcript DOM is rebuilt", () => {
    const transcript = document.createElement("div");
    transcript.innerHTML = "<span>before </span><strong>selected</strong><span> after</span>";
    const firstText = transcript.querySelector("span")?.firstChild;
    const lastText = transcript.querySelector("span:last-child")?.firstChild;
    if (!firstText || !lastText) {
      throw new Error("Expected transcript fixture text");
    }
    const range = document.createRange();
    range.setStart(firstText, 6);
    range.setEnd(lastText, 1);

    const anchor = captureDemoTextAnchor(transcript, range);
    transcript.innerHTML = "<span>before </span><em>selected</em><span> after</span>";

    expect(anchor).toEqual({ end: 15, quote: "selected", start: 7 });
    expect(anchor && restoreDemoTextAnchor(transcript, anchor)?.toString()).toBe("selected");
  });

  it("rejects an anchor after its source text changes", () => {
    const transcript = document.createElement("div");
    transcript.textContent = "before selected after";
    const text = transcript.firstChild;
    if (!text) {
      throw new Error("Expected transcript fixture text");
    }
    const range = document.createRange();
    range.setStart(text, 7);
    range.setEnd(text, 15);
    const anchor = captureDemoTextAnchor(transcript, range);

    transcript.textContent = "before replaced after";

    expect(anchor && restoreDemoTextAnchor(transcript, anchor)).toBeNull();
  });
});
