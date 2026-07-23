import "./style.css";

import ReactDOM from "react-dom/client";
import { createShadowRootUi } from "wxt/utils/content-script-ui/shadow-root";

import { PortalContainerProvider } from "@/components/ui/portal-container";
import { I18nProvider } from "@/features/i18n/I18nProvider";
import { HostThemeProvider } from "@/features/theme/HostThemeProvider";

import App from "./App";

export default defineContentScript({
  matches: ["https://chatgpt.com/*", "https://chat.deepseek.com/*", "https://claude.ai/*"],
  cssInjectionMode: "ui",

  async main(context) {
    const ui = await createShadowRootUi(context, {
      name: "quotecue-ui",
      position: "overlay",
      anchor: "body",
      mode: "closed",
      isolateEvents: [
        "beforeinput",
        "change",
        "click",
        "compositionend",
        "compositionstart",
        "compositionupdate",
        "copy",
        "cut",
        "dblclick",
        "focusin",
        "focusout",
        "input",
        "keydown",
        "keypress",
        "keyup",
        "mousedown",
        "mouseup",
        "paste",
        "pointerdown",
        "pointerup",
      ],
      onMount(container) {
        const shadowRoot = container.getRootNode();
        if (shadowRoot instanceof ShadowRoot) {
          shadowRoot.host.setAttribute("data-quotecue-host", "");
        }
        const app = document.createElement("div");
        app.id = "quotecue-root";
        container.append(app);

        const root = ReactDOM.createRoot(app);
        root.render(
          <PortalContainerProvider container={container}>
            <HostThemeProvider container={container}>
              <I18nProvider>
                <App />
              </I18nProvider>
            </HostThemeProvider>
          </PortalContainerProvider>,
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
