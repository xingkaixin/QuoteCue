export const GUIDE_COPY = {
  "zh-CN": {
    title: "如何给 ChatGPT 回答添加批注，并一次发送多个追问",
    description:
      "QuoteCue 首次使用指南：在 Chrome 或 Edge 安装扩展，选中 ChatGPT 回答添加两条批注，再合并发送。包含实际消息示例和发送失败时的处理方法。",
    label: "首次使用指南",
    link: "查看首次使用指南",
    home: "返回首页",
    demo: "先在官网试一遍",
    intro:
      "QuoteCue 是适用于 Chrome 和 Edge 的免费扩展。选中 AI 回答中的文字，添加批注，再把多处引用与想法合并成一条追问。本指南用 ChatGPT 的京都行程回答，演示从安装到第一次发送的过程。",
    updated: "更新于",
    steps: [
      {
        title: "安装扩展并打开对话",
        body: "通过下方对应浏览器的商店安装 QuoteCue。打开 chatgpt.com 并登录你的 ChatGPT 账号；QuoteCue 不需要额外注册。如果对话页在安装前已经打开，先刷新页面，再打开一段已有回答的对话。",
      },
      {
        title: "选中回答，保存第一条批注",
        body: "在 ChatGPT 的回答中选中想调整的一句话，点击选区旁的 QuoteCue 按钮，输入批注并保存。原文会留下高亮和编号。以下两条引用是示例，练习时请选中你自己回答中实际出现的文字。",
      },
      {
        title: "再标一处，检查两条批注",
        body: "选中另一句话并保存第二条批注。将鼠标移到输入框附近的批注数量上，或用 Tab 聚焦它，可以展开列表。检查引用与评论；需要调整时使用编辑或删除按钮。",
      },
      {
        title: "发送到当前 ChatGPT 对话",
        body: "保存编辑中的评论后，点击输入框旁 QuoteCue 的“发送批注”按钮。输入框中已有的问题也会作为补充问题一并发送。这个操作会真正向 ChatGPT 发送消息；官网演示只展示结果，不会发送给 AI 服务。",
      },
    ],
    example: "两处引用，两条批注",
    selectedText: "选中的原文",
    comment: "我的批注",
    annotations: [
      { selectedText: "清水寺最好八点前到", comment: "第一天九点才能出发，只调整这里。" },
      { selectedText: "竹林小径同样建议八点前到", comment: "第二天可以早起，这个安排保留。" },
    ],
    output: "实际发出的消息是什么样的？",
    outputIntro:
      "下面是不填写补充问题时，这两条示例批注生成的完整消息。消息标签跟随扩展界面语言，引用和评论保留你输入的文字。AI 会如何修改行程，取决于当前对话和模型的回答。",
    recovery: "发送后检查什么？",
    recoveryBody:
      "在对话中确认出现了包含这些批注的用户消息。只有确认匹配的消息已发送，QuoteCue 才会清理相应草稿。如果显示未能确认发送，草稿会保留；先检查对话，避免重复发送，确定没有发出后再重试。",
    troubleshooting: "选中文字后没有按钮？",
    troubleshootingBody:
      "确认扩展已启用，并允许它访问当前受支持站点。请在 AI 回答正文中选择文字；安装前已打开的页面先刷新，再重新选择。QuoteCue 不会在其他网站的任意文字旁出现。",
    platforms: "Claude、DeepSeek 和 Kimi 怎么用？",
    platformsBody:
      "使用下方列出的受支持域名。选中回答、保存批注、检查列表和发送的步骤相同。各站点输入框的外观与位置不同，请以输入框附近的 QuoteCue 批注数量和发送按钮为准。",
    privacy: "草稿会保留多久？",
    privacyBody:
      "有稳定对话标识的草稿保存在浏览器本地，并按对话隔离。尚无稳定标识的新对话只在当前页面会话中保留批注。连续 30 天未更新的草稿会过期；发送确认后会清理对应批注。",
  },
  en: {
    title: "How to annotate ChatGPT answers and send multiple follow-ups at once",
    description:
      "Get started with QuoteCue in Chrome or Edge: install the extension, add two annotations to a ChatGPT answer, and send one follow-up. Includes the resulting message and troubleshooting.",
    label: "Getting started",
    link: "Read the getting started guide",
    home: "Back to home",
    demo: "Try the website demo first",
    intro:
      "QuoteCue is a free Chrome and Edge extension. Select text in an AI answer, add comments, and combine those references into one follow-up. This guide uses a Kyoto itinerary in ChatGPT to walk through installation and your first send.",
    updated: "Updated",
    steps: [
      {
        title: "Install the extension and open a conversation",
        body: "Install QuoteCue from the store for your browser below. Open chatgpt.com and sign in to your ChatGPT account; QuoteCue needs no separate account. Refresh conversation tabs that were open before installation, then open a conversation with an existing answer.",
      },
      {
        title: "Select text and save your first annotation",
        body: "Select a sentence in ChatGPT's answer, click the QuoteCue button beside the selection, write a comment, and save it. A highlight and number mark the passage. The two quotes below are examples; when practicing, select text that actually appears in your own answer.",
      },
      {
        title: "Add another annotation and check both",
        body: "Select another sentence and save a second annotation. Hover over the annotation count near the message box, or focus it with Tab, to open the list. Check the quotes and comments, then use the edit or delete buttons if needed.",
      },
      {
        title: "Send to the current ChatGPT conversation",
        body: "Save any comment you are editing, then click QuoteCue's “Send annotations” button beside the message box. Any question already in the box is included as a supplemental question. This sends a real message to ChatGPT; the website demo only displays the result and does not send it to an AI service.",
      },
    ],
    example: "Two references, two comments",
    selectedText: "Selected text",
    comment: "My comment",
    annotations: [
      {
        selectedText: "Reach Kiyomizu-dera before 8 a.m.",
        comment: "I start at 9 on day one. Change only this.",
      },
      {
        selectedText: "Reach the bamboo grove before 8 a.m. too.",
        comment: "I can start early on day two. Keep this.",
      },
    ],
    output: "What does the sent message look like?",
    outputIntro:
      "This is the complete message generated from the two example annotations with no supplemental question. Message labels follow the extension's interface language; quotes and comments keep your original text. How the AI revises the itinerary depends on the conversation and its response.",
    recovery: "What should you check after sending?",
    recoveryBody:
      "Check that a user message containing your annotations appears in the conversation. QuoteCue clears the matching draft only after confirming that message. If sending is not confirmed, the draft stays. Check the conversation first to avoid a duplicate, then retry if the message was not sent.",
    troubleshooting: "No button after selecting text?",
    troubleshootingBody:
      "Check that the extension is enabled and has permission to access the supported site. Select text in the AI answer itself. Refresh tabs that were open before installation, then select the text again. QuoteCue does not appear beside arbitrary text on other websites.",
    platforms: "What about Claude, DeepSeek, and Kimi?",
    platformsBody:
      "Use the supported domains listed below. Selecting an answer, saving annotations, checking the list, and sending work the same way. Message boxes look different across sites; look for QuoteCue's annotation count and send button near the site's message box.",
    privacy: "How long do drafts stay?",
    privacyBody:
      "Drafts for conversations with a stable identifier stay in your browser and are isolated by conversation. An unidentified new conversation keeps annotations only for the current page session. Drafts expire after 30 days without changes; confirmed sends clear the matching annotations.",
  },
  ja: {
    title: "ChatGPT の回答に注釈を付け、複数の質問をまとめて送る方法",
    description:
      "QuoteCue の使い方：Chrome・Edge に拡張機能をインストールし、ChatGPT の回答に 2 つの注釈を付けて送信。実際の送信文と、送信できない場合の確認方法も紹介します。",
    label: "はじめての使い方",
    link: "はじめての使い方を読む",
    home: "ホームに戻る",
    demo: "まずサイトのデモを試す",
    intro:
      "QuoteCue は Chrome と Edge 向けの無料拡張機能です。AI の回答を選択してコメントを付け、複数の引用を 1 つの質問にまとめます。このガイドでは ChatGPT の京都旅行プランを例に、インストールから最初の送信までを説明します。",
    updated: "更新日",
    steps: [
      {
        title: "インストールして会話を開く",
        body: "下のブラウザに対応するストアから QuoteCue をインストールします。chatgpt.com を開き、ChatGPT のアカウントでログインしてください。QuoteCue 用の登録は不要です。インストール前から開いていたタブは再読み込みし、回答のある会話を開きます。",
      },
      {
        title: "回答を選択して最初の注釈を保存する",
        body: "ChatGPT の回答から変更したい一文を選択し、選択範囲のそばに現れる QuoteCue ボタンを押します。コメントを書いて保存すると、原文にハイライトと番号が付きます。下の引用は例です。練習では自分の回答に実際にある文章を選んでください。",
      },
      {
        title: "もう 1 箇所に注釈を付けて確認する",
        body: "別の文を選び、2 つ目の注釈を保存します。入力欄の近くにある注釈件数にマウスを合わせるか、Tab キーでフォーカスすると一覧が開きます。引用とコメントを確認し、必要なら編集・削除ボタンで調整します。",
      },
      {
        title: "現在の ChatGPT の会話に送信する",
        body: "編集中のコメントを保存し、入力欄のそばにある QuoteCue の「注釈を送信」ボタンを押します。入力欄に書いた質問も補足質問として送信されます。この操作は実際に ChatGPT にメッセージを送ります。サイトのデモは結果を表示するだけで、AI サービスには送信しません。",
      },
    ],
    example: "2 つの引用とコメント",
    selectedText: "選択した原文",
    comment: "コメント",
    annotations: [
      { selectedText: "清水寺には午前 8 時前に到着", comment: "1 日目は 9 時出発。ここだけ変更。" },
      {
        selectedText: "竹林の小径にも午前 8 時前に到着",
        comment: "2 日目は早起きできるので維持。",
      },
    ],
    output: "実際にはどんなメッセージが送られる？",
    outputIntro:
      "補足質問を入力せず、上の 2 つの注釈から生成したメッセージ全文です。ラベルは拡張機能の表示言語に従い、引用とコメントは入力した文章のまま残ります。旅行プランがどう修正されるかは、会話の内容と AI の回答によります。",
    recovery: "送信後に確認すること",
    recoveryBody:
      "注釈を含むユーザーメッセージが会話に表示されたか確認してください。QuoteCue は一致する送信を確認してから、該当する下書きを消去します。送信を確認できない場合は下書きが残ります。重複送信を避けるため、まず会話を確認し、送られていない場合に再試行してください。",
    troubleshooting: "選択してもボタンが出ないときは？",
    troubleshootingBody:
      "拡張機能が有効で、対応サイトへのアクセスが許可されているか確認してください。選択するのは AI の回答本文です。インストール前から開いていたページは再読み込みし、もう一度選択します。対応外のサイトでは表示されません。",
    platforms: "Claude、DeepSeek、Kimi での使い方は？",
    platformsBody:
      "下記の対応ドメインを使ってください。回答の選択、注釈の保存、一覧の確認、送信の手順は共通です。各サイトで入力欄の見た目や位置は異なりますが、その近くにある QuoteCue の注釈件数と送信ボタンが目印です。",
    privacy: "下書きはいつまで残る？",
    privacyBody:
      "安定した識別子がある会話の下書きは、ブラウザ内に会話ごとに保存されます。識別子のない新しい会話の注釈は、そのページのセッション中だけ保持されます。30 日間更新されない下書きは期限切れになり、送信が確認された注釈は消去されます。",
  },
};
