import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  isQuoteCueEvent,
  QUOTECUE_INTERACTIVE_CLASS,
  QUOTECUE_ROOT_ATTR,
  QUOTECUE_ROOT_SELECTOR,
} from "@/lib/dom-identity";

const contentStyle = readFileSync(resolve("entrypoints/content/style.css"), "utf8");

afterEach(() => document.body.replaceChildren());

describe("DOM identity", () => {
  it("keeps stylesheet selectors aligned with the shared contract", () => {
    expect(contentStyle).toContain(`${QUOTECUE_ROOT_SELECTOR} {`);
    expect(contentStyle).toContain(`.${QUOTECUE_INTERACTIVE_CLASS} {`);
  });

  it("recognizes events from descendants of the unified root", () => {
    const root = document.createElement("div");
    const button = document.createElement("button");
    root.setAttribute(QUOTECUE_ROOT_ATTR, "");
    root.append(button);
    document.body.append(root);
    let isQuoteCue = false;
    document.addEventListener(
      "pointerdown",
      (event) => {
        isQuoteCue = isQuoteCueEvent(event);
      },
      { once: true },
    );

    button.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, composed: true }));

    expect(isQuoteCue).toBe(true);
  });
});
