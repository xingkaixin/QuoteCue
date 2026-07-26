import {
  decodeSecureFieldCommand,
  decodeSecureFieldInit,
  type SecureFieldConfig,
} from "@/features/secure-field/secure-field-protocol";
import { isSecureFieldSaveShortcut } from "@/features/secure-field/secure-field-keyboard";

const token = decodeURIComponent(window.location.hash.slice(1));

window.addEventListener("message", connect, { once: true });

function connect(event: MessageEvent<unknown>) {
  const init = decodeSecureFieldInit(event.data, token);
  const port = event.ports[0];
  if (event.source !== window.parent || !init || !port) {
    window.addEventListener("message", connect, { once: true });
    return;
  }

  const field = createField(init.config);
  document.documentElement.dataset.theme = init.config.theme;
  port.onmessage = (message: MessageEvent<unknown>) => {
    const command = decodeSecureFieldCommand(message.data);
    if (command?.type === "focus") {
      field.focus();
    } else if (command?.type === "set-theme") {
      document.documentElement.dataset.theme = command.theme;
    } else if (command?.type === "set-value" && field.value !== command.value) {
      field.value = command.value;
    }
  };
  port.start();
  field.addEventListener("input", () => {
    port.postMessage({ type: "change", value: field.value });
  });
  field.addEventListener("keydown", (fieldEvent) => {
    const keyboardEvent = fieldEvent as KeyboardEvent;
    if (keyboardEvent.key === "Escape") {
      keyboardEvent.preventDefault();
      port.postMessage({ type: "cancel" });
      return;
    }
    if (isSecureFieldSaveShortcut(keyboardEvent, init.config.kind)) {
      keyboardEvent.preventDefault();
      port.postMessage({ type: "save", value: field.value });
    }
  });
  document.body.replaceChildren(field);
  port.postMessage({ type: "ready" });
  requestAnimationFrame(() => field.focus());
}

function createField(config: SecureFieldConfig) {
  const field = document.createElement(config.kind);
  field.setAttribute("aria-label", config.ariaLabel);
  field.setAttribute("autocomplete", "off");
  field.name = config.name;
  field.placeholder = config.placeholder;
  field.value = config.value;
  return field;
}
