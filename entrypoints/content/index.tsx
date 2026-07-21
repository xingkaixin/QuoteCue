import "./style.css";

import ReactDOM from "react-dom/client";
import { createShadowRootUi } from "wxt/utils/content-script-ui/shadow-root";

import { I18nProvider } from "@/features/i18n/I18nProvider";

import App from "./App";

export default defineContentScript({
  matches: ["https://chatgpt.com/*"],
  cssInjectionMode: "ui",

  async main(context) {
    const ui = await createShadowRootUi(context, {
      name: "quotecue-ui",
      position: "overlay",
      anchor: "body",
      isolateEvents: true,
      onMount(container) {
        const app = document.createElement("div");
        app.id = "quotecue-root";
        container.append(app);

        const root = ReactDOM.createRoot(app);
        root.render(
          <I18nProvider>
            <App />
          </I18nProvider>,
        );
        return root;
      },
      onRemove(root) {
        root?.unmount();
      },
    });

    ui.mount();
  },
});
