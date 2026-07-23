import { describe, expect, it } from "vitest";

import type { DraftAnnotation } from "@/features/annotations/annotation";
import { compileAnnotatedPrompt } from "@/features/annotations/prompt-compiler";

const annotations: DraftAnnotation[] = [
  {
    id: "one",
    anchor: {
      messageId: "message-one",
      quote: "全球招聘的基础设施层",
      prefix: "所以它卖的是：",
      suffix: "Deel 的产品矩阵",
      start: 8,
      end: 19,
    },
    comment: "解释这里的基础设施具体包含什么",
  },
  {
    id: "two",
    anchor: {
      messageId: "message-one",
      quote: "不会轻易切换",
      prefix: "而且粘性非常高，公司",
      suffix: "因为涉及员工合同",
      start: 42,
      end: 48,
    },
    comment: "有没有真实的迁移成本数据？",
  },
];

describe("compileAnnotatedPrompt", () => {
  it("combines annotations and the user's prompt in display order", () => {
    expect(compileAnnotatedPrompt(annotations, "请综合判断这个商业模式。")).toMatchInlineSnapshot(`
        "请结合以下批注回答：

        [批注 1]
        选中文本：全球招聘的基础设施层
        我的批注：解释这里的基础设施具体包含什么

        [批注 2]
        选中文本：不会轻易切换
        我的批注：有没有真实的迁移成本数据？

        [补充问题]
        请综合判断这个商业模式。"
      `);
  });

  it("does not add an empty supplemental question", () => {
    expect(compileAnnotatedPrompt(annotations.slice(0, 1), "  ")).not.toContain("[补充问题]");
  });

  it("keeps a selected text annotation without an empty comment label", () => {
    const selectionOnly = [{ ...annotations[0], comment: "" }];

    expect(compileAnnotatedPrompt(selectionOnly, "")).toBe(
      "请结合以下批注回答：\n\n[批注 1]\n选中文本：全球招聘的基础设施层",
    );
  });

  it("uses the active locale for an annotation-only prompt", () => {
    const selectionOnly = [{ ...annotations[0], comment: "" }];

    expect(compileAnnotatedPrompt(selectionOnly, "", "en")).toBe(
      "Please respond based on the following annotations:\n\n[Annotation 1]\nSelected text: 全球招聘的基础设施层",
    );
  });

  it("uses rendered selection text instead of the compact DOM quote", () => {
    const tableSelection = [
      {
        ...annotations[0],
        anchor: {
          ...annotations[0].anchor,
          displayQuote: "alpha beta",
          quote: "alphabeta",
        },
        comment: "",
      },
    ];

    expect(compileAnnotatedPrompt(tableSelection, "", "en")).toContain("Selected text: alpha beta");
  });
});
