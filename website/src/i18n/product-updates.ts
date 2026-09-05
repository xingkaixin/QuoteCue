import type { Locale } from "./locales";

const RELEASES = [
  { version: "0.3.2", publishedAt: "2026-09-05" },
  { version: "0.3.1", publishedAt: "2026-08-31" },
  { version: "0.3.0", publishedAt: "2026-08-24" },
  { version: "0.2.0", publishedAt: "2026-07-23" },
  { version: "0.1.0", publishedAt: "2026-07-22" },
] as const;

type ReleaseVersion = (typeof RELEASES)[number]["version"];

interface ProductUpdateText {
  title: string;
  summary: string;
  highlights: readonly string[];
}

interface ProductUpdatesText {
  eyebrow: string;
  title: string;
  intro: string;
  latestLabel: string;
  releases: Record<ReleaseVersion, ProductUpdateText>;
}

export interface ProductUpdate extends ProductUpdateText {
  version: ReleaseVersion;
  publishedAt: string;
  displayDate: string;
}

export interface ProductUpdatesCopy extends Omit<ProductUpdatesText, "releases"> {
  items: ProductUpdate[];
}

const COPY: Record<Locale, ProductUpdatesText> = {
  "zh-CN": {
    eyebrow: "产品更新",
    title: "持续把追问这件事，做得更可靠",
    intro:
      "QuoteCue 的方向很具体：在更多 AI 网站里，帮你准确指向原文、保住尚未发送的思路，并把多个重点变成一次清楚的追问。这里不罗列内部改动，只记录你真正能感受到的变化。",
    latestLabel: "最新",
    releases: {
      "0.3.2": {
        title: "官网视觉重构上线，多会话发送更安全",
        summary:
          "官网全面改版，以动态流与聚焦汇聚更直观地呈现追问工作流；扩展与全站统一迁移至精细的 Phosphor 图标体系。发送确认现精准隔离至发起会话，多标签页或快速切换会话时草稿更稳固。",
        highlights: [
          "多会话场景下发送确认精确匹配，防止切换会话误清空草稿。",
          "扩展与官网界面图标全面升级，视觉更统一清爽。",
        ],
      },
      "0.3.1": {
        title: "草稿跨标签页同步，发送失败也不丢",
        summary:
          "同一段对话开在多个标签页时，新增、编辑和删除批注会实时同步。只有页面确认匹配的消息已经发出，QuoteCue 才清空草稿；确认不明确或重试失败时，批注和补充问题都会留下。",
        highlights: [
          "回复内容变化后，结合前后文更准确地恢复批注位置。",
          "流式回复、语音输入与页面样式变化时，发送控件保持稳定。",
        ],
      },
      "0.3.0": {
        title: "日语支持上线，安装前也能完整试用",
        summary:
          "扩展和官网新增日语界面；落地页加入可直接选择文字、写批注并预览追问的交互演示。草稿连续 30 天未更新后自动过期，让本地存储保持可控。",
        highlights: [
          "更可靠地识别对话切换和新消息，避免草稿进入错误的对话。",
          "减少大段回答发生变化时的页面处理，让批注渲染更轻量。",
        ],
      },
      "0.2.0": {
        title: "从 ChatGPT 扩展到 Claude、DeepSeek 和 Kimi",
        summary:
          "同一套选中、批注和聚焦追问流程现在可以在四个 AI 网站上使用，并自动跟随各站点的亮色、暗色主题与品牌色。",
        highlights: [
          "删除批注后可在 5 秒内撤销，发送失败后可以直接重试。",
          "无法唯一找回原文位置时明确提示，不把批注放到猜测的位置。",
        ],
      },
      "0.1.0": {
        title: "QuoteCue 首次发布",
        summary:
          "在 ChatGPT 回复里选中文字、写下批注，再把多个重点和输入框里的问题编译成一条聚焦追问。未发送草稿保存在浏览器本地，发送被确认后才清除。",
        highlights: [
          "首发支持简体中文、繁体中文与英文界面。",
          "扩展权限仅限本地存储和 ChatGPT 域名。",
        ],
      },
    },
  },
  en: {
    eyebrow: "Product updates",
    title: "Making every follow-up more dependable",
    intro:
      "QuoteCue is becoming a reliable annotation layer across more AI sites: one that points back to the right text, protects unfinished thinking, and turns several notes into one clear follow-up. This log covers changes you can actually feel, not internal implementation work.",
    latestLabel: "Latest",
    releases: {
      "0.3.2": {
        title: "Redesigned landing experience and scoped send confirmation",
        summary:
          "The website has been overhauled with a dynamic flow hero and focused visual convergence to showcase the follow-up workflow. Extension and website icons have transitioned to Phosphor for sharper visual clarity, and send confirmations are strictly scoped to the originating conversation.",
        highlights: [
          "Send confirmations are strictly scoped to prevent clearing drafts during rapid conversation switching.",
          "Icons across the extension and website now use a consistent, refined Phosphor set.",
        ],
      },
      "0.3.1": {
        title: "Drafts sync across tabs and survive failed sends",
        summary:
          "When the same conversation is open in several tabs, new, edited, and deleted annotations now stay in sync. QuoteCue clears a draft only after the matching sent message is confirmed; uncertain confirmations and failed retries keep every annotation and supplemental question intact.",
        highlights: [
          "Annotations return to the right passage more reliably after an answer changes.",
          "Send controls stay stable during streaming, voice input, and host layout changes.",
        ],
      },
      "0.3.0": {
        title: "Japanese support and a full demo before installing",
        summary:
          "The extension and website are now available in Japanese. The landing page also lets you select text, add annotations, and preview the compiled follow-up before installing. Drafts expire after 30 inactive days to keep local storage predictable.",
        highlights: [
          "Conversation changes and new messages are identified more reliably, keeping drafts on the right thread.",
          "Large answers require less page processing, so annotations render more efficiently.",
        ],
      },
      "0.2.0": {
        title: "Expanded from ChatGPT to Claude, DeepSeek, and Kimi",
        summary:
          "The same select, annotate, and focused follow-up workflow now works across four AI sites, adapting to each site's light or dark theme and accent colour.",
        highlights: [
          "Deleted annotations can be restored for five seconds, and failed sends can be retried.",
          "When source text cannot be restored uniquely, QuoteCue reports it instead of guessing a position.",
        ],
      },
      "0.1.0": {
        title: "QuoteCue launched",
        summary:
          "Select text in a ChatGPT answer, attach annotations, and compile several focal points plus the composer question into one follow-up. Unsent drafts stay in local browser storage and clear only after a send is confirmed.",
        highlights: [
          "The first release included English, Simplified Chinese, and Traditional Chinese.",
          "Extension access was limited to local storage and the ChatGPT domain.",
        ],
      },
    },
  },
  ja: {
    eyebrow: "製品アップデート",
    title: "フォローアップを、もっと確実なものへ",
    intro:
      "QuoteCue は、より多くの AI サイトで使える信頼性の高い注釈レイヤーを目指しています。元の文章を正確に示し、送信前の考えを守り、複数の論点を 1 つの明確なフォローアップにまとめます。ここでは内部実装ではなく、実際に感じられる変化を記録します。",
    latestLabel: "最新",
    releases: {
      "0.3.2": {
        title: "サイトデザインの刷新と、より安全な会話間送信確認",
        summary:
          "ウェブサイトのデザインを刷新し、動的なフローと論点集約のビジュアルで追問の流れをより直感的に表現しました。拡張機能とサイト全体のアイコンを洗練された Phosphor に統一し、送信確認を発信元の会話に厳密に限定することで下書きの保持をより強固にしました。",
        highlights: [
          "複数の会話を開いていても送信確認が厳密に一致し、切り替え時の下書き誤消去を防ぎます。",
          "拡張機能とウェブサイトのアイコンを統一し、より精細で整った視覚体験を提供します。",
        ],
      },
      "0.3.1": {
        title: "タブ間で下書きを同期し、送信失敗時も保持",
        summary:
          "同じ会話を複数のタブで開いている場合、注釈の追加、編集、削除がリアルタイムで同期されます。一致する送信済みメッセージを確認できた場合だけ下書きを消去し、確認が曖昧な場合や再試行に失敗した場合は、注釈と補足質問をすべて保持します。",
        highlights: [
          "回答が変化した後も、前後の文脈を使って注釈の位置をより正確に復元します。",
          "ストリーミング、音声入力、サイトのレイアウト変化があっても送信操作を安定させました。",
        ],
      },
      "0.3.0": {
        title: "日本語対応と、インストール前に試せるデモ",
        summary:
          "拡張機能とウェブサイトが日本語に対応しました。ランディングページでは、文章の選択、注釈の追加、まとめられたフォローアップの確認まで実際に試せます。30 日間更新されていない下書きは期限切れになり、ローカル保存容量を予測可能に保ちます。",
        highlights: [
          "会話の切り替えと新しいメッセージをより確実に識別し、下書きを正しい会話に保ちます。",
          "長い回答で必要なページ処理を減らし、注釈をより軽量に描画します。",
        ],
      },
      "0.2.0": {
        title: "ChatGPT から Claude、DeepSeek、Kimi へ対応を拡大",
        summary:
          "文章を選び、注釈を付け、的確なフォローアップにまとめる同じ操作が 4 つの AI サイトで使えるようになり、各サイトのライト・ダークテーマとアクセントカラーにも適応します。",
        highlights: [
          "削除した注釈は 5 秒以内なら元に戻せ、送信に失敗した場合は再試行できます。",
          "元の文章を一意に復元できない場合は、位置を推測せず明確に知らせます。",
        ],
      },
      "0.1.0": {
        title: "QuoteCue を初公開",
        summary:
          "ChatGPT の回答から文章を選択して注釈を付け、複数の論点と入力欄の質問を 1 つのフォローアップにまとめられるようになりました。未送信の下書きはブラウザ内に保存し、送信確認後にのみ消去します。",
        highlights: [
          "初回リリースから英語、簡体字中国語、繁体字中国語に対応しました。",
          "拡張機能のアクセス権をローカルストレージと ChatGPT ドメインに限定しました。",
        ],
      },
    },
  },
};

export const LATEST_PRODUCT_UPDATE_DATE = RELEASES[0].publishedAt;

export function getProductUpdates(locale: Locale): ProductUpdatesCopy {
  const copy = COPY[locale];
  const formatter = new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

  return {
    eyebrow: copy.eyebrow,
    title: copy.title,
    intro: copy.intro,
    latestLabel: copy.latestLabel,
    items: RELEASES.map((release) => ({
      ...release,
      ...copy.releases[release.version],
      displayDate: formatter.format(new Date(`${release.publishedAt}T00:00:00Z`)),
    })),
  };
}
