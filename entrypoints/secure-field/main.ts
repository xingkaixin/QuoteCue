import {
  decodeSecureFieldCommand,
  decodeSecureFieldInit,
  type SecureFieldConfig,
  type SecureFieldUpdate,
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
  applyUpdate(field, init.config);
  port.onmessage = (message: MessageEvent<unknown>) => {
    const command = decodeSecureFieldCommand(message.data);
    if (command?.type === "focus") {
      field.focus();
    } else if (command?.type === "update") {
      applyUpdate(field, command.update);
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
  field.setAttribute("autocomplete", "off");
  if (config.maxLength !== undefined) {
    field.maxLength = config.maxLength;
  }
  field.name = config.name;
  return field;
}

function applyUpdate(field: HTMLInputElement | HTMLTextAreaElement, update: SecureFieldUpdate) {
  document.documentElement.lang = update.lang;
  document.documentElement.dataset.theme = update.theme;
  field.setAttribute("aria-label", update.ariaLabel);
  field.placeholder = update.placeholder;
  if (field.value !== update.value) {
    field.value = update.value;
  }
}
