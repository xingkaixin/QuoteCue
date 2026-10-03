export const FOCUSED_FOLLOW_UP_COPY = {
  "zh-CN": {
    title: "如何让 ChatGPT 只修改回答中的指定部分",
    description:
      "用原文引用、逐条修改要求和保留范围，向 ChatGPT 提出局部修改。包含可复制的提示词、多个段落的反馈示例，以及用 QuoteCue 批注整理追问的方法。",
    label: "局部修改指南",
    intro:
      "想让 ChatGPT 只改回答的一部分，可以引用要改的原句，紧接着写具体修改要求，再说明哪些内容要保留。多处修改时，把每段引用与对应要求分开编号。这样能明确修改范围，但不能保证模型完全遵守；收到回复后仍需核对未要求修改的部分。",
    stepsTitle: "把“改一下”写成三项明确要求",
    steps: [
      {
        title: "引用原句，保留必要的上下文",
        body: "不要只写“第二段不对”。复制能定位问题的句子；如果同一句话出现多次，加上小标题或相邻文字。这样在一段很长的回答里，也能区分你说的是哪一处。",
      },
      {
        title: "说明怎么改，以及为什么",
        body: "把“更好一点”换成可检查的要求。例如“第一天九点才能出发，请把这处到达时间往后调整，并说明交通安排”。一个引用后面放一组相关要求，避免把多个段落的反馈混在一起。",
      },
      {
        title: "明确保留范围和返回格式",
        body: "如果第二天的安排不用变，直接写“保留第二天安排”。再说明要完整修订稿还是只返回修改段落。涉及时间、预算等相互依赖的内容时，请模型指出必要的连带调整。",
      },
    ],
    templateTitle: "可直接复制的局部修改提示词",
    templateIntro:
      "在原对话里使用下面的模板，替换方括号里的内容。一处修改用复制粘贴就足够；多处反馈可以继续添加编号。",
    template:
      "请根据下面的反馈修改上一条回答。\n\n1. 原文：[粘贴第一处要改的文字]\n修改要求：[具体要改什么，以及原因]\n\n2. 原文：[粘贴另一处文字]\n处理要求：[修改要求，或说明这一处保留]\n\n保留范围：[不需要修改的段落、事实或语气]\n返回格式：[只返回修改的段落 / 返回完整修订稿]\n如果这些要求会影响其他部分，请先指出冲突，不要默默改动。",
    exampleTitle: "示例：两处相似的行程建议，一处改、一处留",
    exampleIntro:
      "假设回答给第一天和第二天都安排了早起。只说“不要这么早”无法说明要改哪一天。可以分别写：",
    examples: [
      {
        quote: "第一天：八点前到清水寺。",
        comment: "第一天九点才能出发，请调整这一处的时间和交通。",
      },
      { quote: "第二天：八点前到竹林小径。", comment: "第二天可以早起，保留这处安排。" },
    ],
    exampleEnd:
      "最后补一句“返回完整三天行程，保留第三天安排；如果顺序需要变化请说明”。这样同时交代了引用、修改要求和保留范围。",
    extensionTitle: "多处反馈时，用 QuoteCue 把引用和批注放在一起",
    extensionBody:
      "QuoteCue 是免费、开源的电脑端 Chrome 和 Edge 扩展。在 ChatGPT、Claude、DeepSeek 或 Kimi 的回答里选中文字，写下批注并保存；继续选择其他位置，最后检查批注列表。点击“发送批注”时，它把引用和评论编译成一条消息，并附上输入框里的补充要求。",
    extensionNote:
      "官网演示不会向 AI 发送消息。扩展中的发送会进入当前对话；是否按要求修改由 AI 模型决定，QuoteCue 不会直接编辑原回答。",
    checksTitle: "收到新回答后，检查这三件事",
    checks: [
      "要求改的每一处是否都已处理。",
      "要求保留的事实、段落和语气是否发生变化。",
      "时间、预算等相关内容是否仍然一致；需要核实的事实是否有可靠来源。",
    ],
    related: "继续阅读",
  },
  en: {
    title: "How to Ask ChatGPT to Change Only Part of an Answer",
    description:
      "Ask ChatGPT for a targeted revision using exact quotes, specific feedback, and a clear scope. Includes a copyable prompt and a multi-passage annotation example.",
    label: "Targeted revisions",
    intro:
      "To ask ChatGPT to change only part of an answer, quote the passage, put a specific instruction beside it, and state what should stay unchanged. Number each quote and instruction when reviewing several passages. This makes the scope explicit, but it does not guarantee the model will follow it. Check the preserved sections in the next answer too.",
    stepsTitle: "Give three instructions for a targeted revision",
    steps: [
      {
        title: "Quote the passage with enough context",
        body: "Instead of saying “the second paragraph is wrong,” copy the sentence you mean. If the same wording appears twice, include its heading or a neighboring sentence. The reference should identify one passage even in a long answer.",
      },
      {
        title: "Say what to change and why",
        body: "Replace “make this better” with a requirement you can check. For example: “I cannot leave before 9 a.m. on day one. Move this arrival later and update the travel instructions.” Keep each passage beside its own feedback.",
      },
      {
        title: "State what to preserve and what to return",
        body: "If day two already works, explicitly ask to keep it. Specify whether you want only the revised paragraphs or a complete revised answer. For connected details such as times or budgets, ask the model to explain any necessary changes elsewhere.",
      },
    ],
    templateTitle: "A copyable prompt for changing part of an answer",
    templateIntro:
      "Use this in the original conversation and replace the bracketed text. Copy and paste is enough for one change; add numbered entries when you have several.",
    template:
      "Revise your previous answer using this feedback.\n\n1. Original passage: [paste the first passage]\nRequested change: [what to change and why]\n\n2. Original passage: [paste another passage]\nInstruction: [what to change, or state that this should stay]\n\nPreserve: [sections, facts, or tone that should stay unchanged]\nReturn: [only revised paragraphs / the complete revised answer]\nIf these requests affect another part of the answer, explain the conflict instead of silently changing it.",
    exampleTitle: "Example: change one early start and keep the other",
    exampleIntro:
      "Suppose an itinerary recommends starting early on both days. “Do not start so early” does not identify which day you mean. Separate the feedback:",
    examples: [
      {
        quote: "Day one: reach Kiyomizu-dera before 8 a.m.",
        comment:
          "I cannot leave until 9 a.m. on day one. Update this arrival time and the travel instructions.",
      },
      {
        quote: "Day two: reach the bamboo grove before 8 a.m.",
        comment: "I can start early on day two. Keep this arrangement.",
      },
    ],
    exampleEnd:
      "Finish with: “Return the complete three-day itinerary. Keep day three unchanged, and explain any changes to the order.” The quotes, requested changes, and preserved scope are now explicit.",
    extensionTitle: "Use QuoteCue to collect feedback on several passages",
    extensionBody:
      "QuoteCue is a free, open-source extension for desktop Chrome and Edge. Select text in a ChatGPT, Claude, DeepSeek, or Kimi answer, add a comment, and save it. Repeat for other passages and review the annotation list. “Send annotations” compiles the quotes and comments into one message, including any supplemental instruction in the message box.",
    extensionNote:
      "The website demo does not send anything to an AI service. Sending from the extension posts to the current conversation. The model decides how to respond; QuoteCue does not edit the original answer directly.",
    checksTitle: "Check three things in the revised answer",
    checks: [
      "Every requested change has been addressed.",
      "Facts, sections, and tone you asked to preserve are still intact.",
      "Related times, budgets, and other details remain consistent; factual claims that need verification have reliable sources.",
    ],
    related: "Related guide",
  },
  ja: {
    title: "ChatGPT の回答を一部分だけ修正してもらう方法",
    description:
      "ChatGPT に回答の一部分だけを修正してもらうための、原文の引用・具体的な指示・残す範囲の伝え方。コピーできるプロンプトと、複数箇所へのコメント例を紹介します。",
    label: "部分修正ガイド",
    intro:
      "ChatGPT に回答の一部分だけを修正してもらうには、対象の文章を引用し、すぐ隣に具体的な修正内容を書き、変更しない部分も指定します。複数箇所なら、引用と指示を番号で分けます。修正範囲は明確になりますが、モデルが必ず守るとは限りません。次の回答で、残すよう指定した部分も確認してください。",
    stepsTitle: "部分修正を依頼するときの 3 つの伝え方",
    steps: [
      {
        title: "文脈が分かるように原文を引用する",
        body: "「2 段落目が違う」だけでなく、対象の一文をコピーします。同じ表現が繰り返される場合は、見出しや前後の一文も添えます。長い回答でも、どの箇所を指しているか分かるようにします。",
      },
      {
        title: "何をどう変えたいか、理由と一緒に書く",
        body: "「もっとよくして」を、確認できる条件に置き換えます。例えば「1 日目は 9 時まで出発できません。この到着時刻を遅くして、移動方法も調整してください」。各引用に対応する指示を付け、別の箇所への要望を混ぜないようにします。",
      },
      {
        title: "残す範囲と回答形式を指定する",
        body: "2 日目の予定が問題なければ、「2 日目は変更しない」と明記します。修正箇所だけ返してほしいのか、全文が必要なのかも伝えます。時刻や予算のように関連する内容は、ほかの部分にも変更が必要なら説明するよう頼みます。",
      },
    ],
    templateTitle: "コピーして使える部分修正プロンプト",
    templateIntro:
      "元の会話で、角括弧の中を置き換えて使ってください。1 箇所ならコピー＆ペーストで十分です。複数ある場合は番号付きの項目を追加します。",
    template:
      "前の回答を、以下のフィードバックに沿って修正してください。\n\n1. 原文：[修正したい箇所を貼り付ける]\n修正内容：[何をどう変えるか、その理由]\n\n2. 原文：[別の箇所を貼り付ける]\n指示：[修正内容、またはこの箇所は残すと明記]\n\n変更しない部分：[残す段落・事実・文体]\n回答形式：[修正した段落のみ / 修正後の全文]\nほかの部分に影響する場合は、黙って変更せず、矛盾点を説明してください。",
    exampleTitle: "例：似た 2 つの早朝プランで、片方だけ変更する",
    exampleIntro:
      "1 日目と 2 日目の両方で早起きが提案されているとします。「そんなに早く出発したくない」だけでは、どちらの日か分かりません。次のように分けます。",
    examples: [
      {
        quote: "1 日目：午前 8 時前に清水寺へ到着。",
        comment: "1 日目は 9 時まで出発できません。この到着時刻と移動方法を調整してください。",
      },
      {
        quote: "2 日目：午前 8 時前に竹林の小径へ到着。",
        comment: "2 日目は早起きできます。この予定は残してください。",
      },
    ],
    exampleEnd:
      "最後に「3 日間のプラン全文を返してください。3 日目は維持し、順序の変更が必要なら説明してください」と添えます。引用、修正内容、残す範囲が明確になります。",
    extensionTitle: "複数箇所のフィードバックを QuoteCue でまとめる",
    extensionBody:
      "QuoteCue はパソコン版 Chrome・Edge 向けの無料・オープンソース拡張機能です。ChatGPT、Claude、DeepSeek、Kimi の回答から文章を選び、コメントを付けて保存します。ほかの箇所も選び、注釈一覧を確認します。「注釈を送信」を押すと、引用とコメントが 1 つのメッセージになり、入力欄の補足指示も含めて送信されます。",
    extensionNote:
      "サイトのデモは AI に送信しません。拡張機能からの送信は現在の会話に投稿されます。どう修正するかはモデルが判断します。QuoteCue が元の回答を直接編集することはありません。",
    checksTitle: "修正後の回答で確認する 3 つのこと",
    checks: [
      "依頼した箇所がすべて修正されているか。",
      "残すよう指定した事実・段落・文体が変わっていないか。",
      "時刻や予算などに矛盾がないか。確認が必要な事実に信頼できる出典があるか。",
    ],
    related: "あわせて読む",
  },
};
