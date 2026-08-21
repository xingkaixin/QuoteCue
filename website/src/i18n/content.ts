export type Locale = "zh-CN" | "en";

export interface DemoCopy {
  locale: Locale;
  title: string;
  intro: string;
  userMessage: string;
  answer: string[];
  steps: string[];
  selectAction: string;
  selectedText: string;
  userComment: string;
  optionalComment: string;
  cancel: string;
  save: string;
  edit: string;
  remove: string;
  clear: string;
  undo: string;
  sending: string;
  send: string;
  composerPrefix: string;
  clearConfirm: string;
  compiledPrompt: {
    intro: string;
    annotation: string;
    selection: string;
    comment: string;
    supplementalQuestion: string;
  };
}

const links = {
  chrome: "https://chromewebstore.google.com/detail/quotecue/gbppndnpgjmgmbepccdcbfmdjjiehofp",
  edge: "https://microsoftedge.microsoft.com/addons/detail/icopgahikmamgfagjdjjdfobfnhicbie",
  github: "https://github.com/xingkaixin/QuoteCue",
} as const;

const zh = {
  locale: "zh-CN" as const,
  languageName: "中文",
  alternateLanguage: "EN",
  alternateLanguageLabel: "Switch to English",
  alternateLanguageUrl: "/en/",
  themeLabel: "切换亮色或暗色主题",
  meta: {
    title: "QuoteCue：给 AI 回答做批注，一次聚焦追问",
    description:
      "QuoteCue 是适用于 ChatGPT、Claude、DeepSeek 和 Kimi 的 Chrome 与 Edge 扩展。选中 AI 回答、添加批注，再把多个重点编译成一次聚焦追问。",
  },
  nav: {
    demo: "试一试",
    features: "特性",
    privacy: "隐私",
    faq: "常见问题",
  },
  hero: {
    eyebrow: "Chrome / Edge 扩展 · ChatGPT · Claude · DeepSeek · Kimi",
    before: "给 AI 的回答",
    highlight: "划个重点",
    after: "，再追问。",
    description:
      "在 AI 的回复里选中任意一段文字，写下你的想法。QuoteCue 把所有批注编译成一条聚焦的追问，一次发出去——不用复制粘贴，也不用重新描述“我说的是第三段那句”。",
    chrome: "添加到 Chrome",
    edge: "添加到 Edge",
    note: "免费 · 无账号 · 无服务器",
  },
  demo: {
    locale: "zh-CN",
    title: "现在就试一遍",
    intro:
      "用鼠标选中下面这段回答里的任意一句话，QuoteCue 按钮就会浮出来。这就是它装进 AI 对话页面后的样子。",
    userMessage: "帮我规划一个三天的京都行程。",
    answer: [
      "三天可以按区域来分，这样能省下大量在路上的时间。第一天走东山线：清水寺开门早，八点前到人最少，之后沿二年坂、三年坂步行到高台寺，傍晚在祇园一带吃饭。",
      "第二天去岚山。建议先坐嵯峨野小火车，再走竹林小径回渡月桥，下午可以在天龙寺的庭园里坐一会儿。这一天的步行距离不短，穿一双舒服的鞋。",
      "第三天留给伏见稻荷和宇治。千本鸟居完整走完大约需要两小时；如果只是想拍照，走到四辻折返就够了。之后坐电车去宇治喝抹茶，回程正好赶上晚饭。",
    ],
    steps: [
      "选中回答里的一句话，浮出的 QuoteCue 按钮就在选区旁边。",
      "写下批注并保存，原文留下高亮和一个编号角标。",
      "继续标第二处、第三处，汇总面板里能逐条编辑或删除。",
      "点发送，所有批注被编译成一条结构化追问，发进当前对话。",
    ],
    selectAction: "QuoteCue",
    selectedText: "选中文本：",
    userComment: "我的批注：",
    optionalComment: "添加可选批注…",
    cancel: "取消",
    save: "保存",
    edit: "编辑批注",
    remove: "删除批注",
    clear: "清空全部批注",
    undo: "撤销",
    sending: "正在发送批注…",
    send: "发送批注",
    composerPrefix: "问问",
    clearConfirm: "再点一次清空",
    compiledPrompt: {
      intro: "请结合以下批注回答：",
      annotation: "批注",
      selection: "选中文本：",
      comment: "我的批注：",
      supplementalQuestion: "[补充问题]",
    },
  } satisfies DemoCopy,
  features: {
    title: "它替你记住上下文",
    items: [
      {
        title: "批注锚定在原文上",
        body: "每条批注都记住选中的文字和位置。刷新后高亮与角标会回到原处；原文确实变化时，它会明确标记位置变化，而不是悄悄错位。",
      },
      {
        title: "草稿按对话隔离",
        body: "草稿存在浏览器本地，跟着对话走。切到别的对话再回来，批注仍留在原来的对话里。",
      },
      {
        title: "一条消息，多个焦点",
        body: "发送时，所有批注会编译成带编号的结构化追问：选中文本、你的批注，再加上输入框里补充的问题。",
      },
      {
        title: "发送失败不丢草稿",
        body: "只有页面真的出现匹配的用户消息，批注才会清除。没有确认成功就继续保留，可以直接重试。",
      },
      {
        title: "删除有 5 秒后悔时间",
        body: "删除的批注先隐藏，5 秒内可以撤销。清空全部需要再点一次确认。",
      },
      {
        title: "跟着站点走",
        body: "自动适配站点的亮色或暗色主题与品牌色。全程支持键盘操作，按 Escape 退出后焦点回到原处。",
      },
    ],
  },
  supported: {
    label: "支持的站点 · 扩展仅在这四个域名下运行",
  },
  privacy: {
    title: ["扩展没有服务器，", "也就没有数据可传"],
    description:
      "QuoteCue 扩展不运营服务器，也不收集账号、Cookie、浏览记录或使用统计。批注只在你点击发送时，作为消息内容进入你正在使用的 AI 服务。",
    facts: [
      { label: "storage", body: "唯一申请的扩展权限，用来把未发送的批注存在本地。" },
      { label: "4 hosts", body: "只在四个受支持的域名下运行，不向其他网站注入。" },
      {
        label: "closed",
        body: "界面渲染在 closed Shadow DOM 里，批注输入框来自扩展自身来源。",
      },
      {
        label: "30 days",
        body: "连续 30 天未更新的本地草稿自动过期；发送成功或清空后立即删除。",
      },
    ],
  },
  faq: {
    title: "常见问题",
    items: [
      {
        question: "QuoteCue 会看到我全部的对话内容吗？",
        answer:
          "不会。QuoteCue 只处理你主动选中的回答文字，以及恢复该选区所需的少量周边文字和位置信息。它不会收集整段对话、账号凭据、Cookie 或浏览历史。",
      },
      {
        question: "刷新页面后批注还在吗？",
        answer:
          "在能从网址识别对话的页面上，未发送批注会保存在浏览器本地并在刷新后恢复。新建且还没有稳定标识的对话无法安全归属草稿，因此批注只保留到当前页面会话结束。",
      },
      {
        question: "发送出去的到底是什么？",
        answer:
          "QuoteCue 发送一条普通用户消息：开头说明回答应结合批注，然后逐条列出选中文本与对应批注，最后附上你在输入框补充的问题。上面的交互演示会展示实际编译结果。",
      },
      {
        question: "QuoteCue 支持哪些 AI 网站和浏览器？",
        answer:
          "QuoteCue 目前支持 ChatGPT、Claude、DeepSeek 和 Kimi，并分别提供 Chrome 与 Microsoft Edge 版本。扩展只在这四个服务的指定域名运行。",
      },
      {
        question: "怎么彻底删除 QuoteCue 的本地数据？",
        answer:
          "发送成功或清空批注会立即删除对应草稿；连续 30 天未更新的当前版本草稿会自动过期。卸载 QuoteCue 扩展即可移除浏览器中由它保存的全部本地数据。",
      },
    ],
  },
  closing: {
    title: "下一次追问，直接指到那一句。",
    description: "安装后打开 ChatGPT、Claude、DeepSeek 或 Kimi，选中一段回答就能开始。",
  },
  links,
} as const;

const en = {
  locale: "en" as const,
  languageName: "English",
  alternateLanguage: "中文",
  alternateLanguageLabel: "切换到中文",
  alternateLanguageUrl: "/",
  themeLabel: "Switch between light and dark theme",
  meta: {
    title: "QuoteCue – Annotate AI Answers, Ask Better Follow-ups",
    description:
      "QuoteCue is a free Chrome and Edge extension for annotating ChatGPT, Claude, DeepSeek, and Kimi answers, then sending one focused follow-up.",
  },
  nav: {
    demo: "Try it",
    features: "Features",
    privacy: "Privacy",
    faq: "FAQ",
  },
  hero: {
    eyebrow: "Chrome / Edge extension · ChatGPT · Claude · DeepSeek · Kimi",
    before: "Point at what",
    highlight: "actually matters",
    after: " in an answer.",
    description:
      "Select any part of an AI response and write what you think. QuoteCue compiles every note into one focused follow-up and sends it in a single message—no copy-pasting and no “I meant the sentence in the third paragraph.”",
    chrome: "Add to Chrome",
    edge: "Add to Edge",
    note: "Free · No account · No server",
  },
  demo: {
    locale: "en",
    title: "Try the whole flow",
    intro:
      "Select any sentence in the answer below and the QuoteCue button floats up. This is how it behaves inside a supported AI conversation.",
    userMessage: "Plan me a three-day itinerary for Kyoto.",
    answer: [
      "Split the three days by district so you spend less time in transit. Day one is the Higashiyama route: Kiyomizu-dera opens early and is quietest before eight, then walk down Ninenzaka and Sannenzaka to Kodai-ji and have dinner around Gion.",
      "Day two is Arashiyama. Take the Sagano scenic railway first, walk back through the bamboo grove to Togetsukyo Bridge, and spend the afternoon sitting in the Tenryu-ji garden. It is a long walking day, so wear comfortable shoes.",
      "Day three belongs to Fushimi Inari and Uji. The full Senbon Torii loop takes about two hours; if you only want photos, turning back at Yotsutsuji is enough. Then take the train to Uji for matcha and get back in time for dinner.",
    ],
    steps: [
      "Select a sentence; the QuoteCue button floats up right next to the selection.",
      "Write a note and save. The text keeps a highlight and a numbered cue.",
      "Mark a second and third spot; the summary panel edits or deletes each one.",
      "Hit send: every note compiles into one structured follow-up in the same chat.",
    ],
    selectAction: "QuoteCue",
    selectedText: "Selected text:",
    userComment: "My comment:",
    optionalComment: "Add an optional comment…",
    cancel: "Cancel",
    save: "Save",
    edit: "Edit annotation",
    remove: "Delete annotation",
    clear: "Clear all annotations",
    undo: "Undo",
    sending: "Sending annotations…",
    send: "Send annotations",
    composerPrefix: "Ask",
    clearConfirm: "Click again to clear",
    compiledPrompt: {
      intro: "Please respond based on the following annotations:",
      annotation: "Annotation",
      selection: "Selected text: ",
      comment: "My comment: ",
      supplementalQuestion: "[Supplemental question]",
    },
  } satisfies DemoCopy,
  features: {
    title: "It keeps the context for you",
    items: [
      {
        title: "Notes anchor to the text",
        body: "Every note remembers the exact text and position. Highlights and cues return after a reload; if the source changed, QuoteCue reports it instead of silently drifting.",
      },
      {
        title: "Drafts stay per conversation",
        body: "Drafts live in local browser storage and follow the conversation. Switch away and back, and the notes remain on the right thread.",
      },
      {
        title: "One message, many focal points",
        body: "On send, every note compiles into a numbered prompt with the selected text, your comment, and any question already in the composer.",
      },
      {
        title: "A failed send never loses work",
        body: "Notes clear only after the matching user message appears on the page. Until then they stay available for an immediate retry.",
      },
      {
        title: "Five seconds to undo",
        body: "A deleted note hides first and can be restored for five seconds. Clearing everything requires a second confirmation.",
      },
      {
        title: "Follows the site",
        body: "QuoteCue adapts to each site's light or dark theme and brand colour. It is keyboard operable, with focus restored after Escape.",
      },
    ],
  },
  supported: {
    label: "Supported sites · the extension runs on these four domains only",
  },
  privacy: {
    title: ["No extension server,", "so there is nothing to upload"],
    description:
      "The QuoteCue extension runs no server and collects no accounts, cookies, browsing history, or usage analytics. Your notes reach an AI service only as the message you explicitly choose to send.",
    facts: [
      {
        label: "storage",
        body: "The only extension permission, used to store unsent notes locally.",
      },
      { label: "4 hosts", body: "Runs on the four supported domains and injects nowhere else." },
      {
        label: "closed",
        body: "The UI renders in a closed Shadow DOM and the note field uses the extension's origin.",
      },
      {
        label: "30 days",
        body: "A current-version draft untouched for 30 days expires; send or clear deletes it at once.",
      },
    ],
  },
  faq: {
    title: "Frequently asked questions",
    items: [
      {
        question: "Does QuoteCue read my whole conversation?",
        answer:
          "No. QuoteCue processes only the answer text you deliberately select, plus a small amount of surrounding text and position data needed to restore that selection. It does not collect entire conversations, credentials, cookies, or browsing history.",
      },
      {
        question: "Do QuoteCue annotations survive a page reload?",
        answer:
          "Yes, when the conversation has a stable identifier in its URL. Unsent annotations are stored locally and restored after reload. In a brand-new conversation without a stable identifier, the draft lasts only for the current page session.",
      },
      {
        question: "What exactly does QuoteCue send?",
        answer:
          "QuoteCue sends one ordinary user message: a short instruction, each selected passage paired with its annotation, and any supplemental question from the composer. The interactive demo above shows the exact compiled structure before clearing the draft.",
      },
      {
        question: "Which AI sites and browsers does QuoteCue support?",
        answer:
          "QuoteCue currently supports ChatGPT, Claude, DeepSeek, and Kimi. Separate versions are available for Google Chrome and Microsoft Edge, and the extension runs only on the four declared service domains.",
      },
      {
        question: "How do I remove all locally stored QuoteCue data?",
        answer:
          "A confirmed send or explicit clear removes that conversation's draft immediately. Current-version drafts also expire after 30 days without an update. Uninstalling the QuoteCue extension removes all QuoteCue data stored in the browser profile.",
      },
    ],
  },
  closing: {
    title: "Next time, just point at the sentence.",
    description:
      "Install QuoteCue, open ChatGPT, Claude, DeepSeek, or Kimi, and select part of an answer to begin.",
  },
  links,
} as const;

export type LandingCopy = typeof zh | typeof en;

export function getCopy(locale: Locale): LandingCopy {
  return locale === "en" ? en : zh;
}
