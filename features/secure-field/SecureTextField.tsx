/* oxlint-disable react/iframe-missing-sandbox -- Extension-origin modules require their origin; the parent page remains cross-origin. */
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { browser } from "wxt/browser";

import { useI18n } from "@/features/i18n/I18nProvider";
import { useHostTheme } from "@/features/theme/HostThemeProvider";

import {
  decodeSecureFieldEvent,
  SECURE_FIELD_INIT,
  type SecureFieldConfig,
  type SecureFieldEvent,
  type SecureFieldUpdate,
} from "./secure-field-protocol";

export type SecureTextFieldHandle = {
  focus: () => void;
};

type SecureTextFieldProps = Omit<SecureFieldConfig, "lang" | "theme"> & {
  className?: string;
  onCancel: () => void;
  onChange: (value: string) => void;
  onSave: (value: string) => void;
};

export const SecureTextField = forwardRef<SecureTextFieldHandle, SecureTextFieldProps>(
  function SecureTextField(
    { ariaLabel, className, kind, maxLength, name, onCancel, onChange, onSave, placeholder, value },
    ref,
  ) {
    const { locale } = useI18n();
    const theme = useHostTheme();
    const [token] = useState(() => crypto.randomUUID());
    const frameUrl = browser.runtime.getURL(`/secure-field.html#${encodeURIComponent(token)}`);
    const frameRef = useRef<HTMLIFrameElement>(null);
    const portRef = useRef<MessagePort | null>(null);
    const configRef = useRef<SecureFieldConfig>({
      ariaLabel,
      kind,
      lang: locale,
      maxLength,
      name,
      placeholder,
      theme,
      value,
    });
    const handlersRef = useRef({ onCancel, onChange, onSave });

    const update = useMemo<SecureFieldUpdate>(
      () => ({ ariaLabel, lang: locale, placeholder, theme, value }),
      [ariaLabel, locale, placeholder, theme, value],
    );
    configRef.current = { ...update, kind, maxLength, name };
    handlersRef.current = { onCancel, onChange, onSave };

    const handleFieldEvent = useCallback((event: MessageEvent<unknown>) => {
      const fieldEvent = decodeSecureFieldEvent(event.data);
      if (!fieldEvent) {
        return;
      }
      dispatchFieldEvent(fieldEvent, handlersRef.current);
    }, []);

    const connect = useCallback(() => {
      const contentWindow = frameRef.current?.contentWindow;
      if (!contentWindow) {
        return;
      }

      portRef.current?.close();
      const channel = new MessageChannel();
      channel.port1.onmessage = handleFieldEvent;
      channel.port1.start();
      portRef.current = channel.port1;
      contentWindow.postMessage(
        { type: SECURE_FIELD_INIT, token, config: configRef.current },
        new URL(frameUrl).origin,
        [channel.port2],
      );
    }, [frameUrl, handleFieldEvent, token]);

    useEffect(() => {
      portRef.current?.postMessage({ type: "update", update });
    }, [update]);

    useEffect(
      () => () => {
        portRef.current?.close();
        portRef.current = null;
      },
      [],
    );

    useImperativeHandle(
      ref,
      () => ({
        focus() {
          portRef.current?.postMessage({ type: "focus" });
        },
      }),
      [],
    );

    return (
      <iframe
        aria-label={ariaLabel}
        className={className}
        lang={locale}
        onLoad={connect}
        ref={frameRef}
        referrerPolicy="no-referrer"
        sandbox="allow-same-origin allow-scripts"
        src={frameUrl}
        title={ariaLabel}
      />
    );
  },
);

function dispatchFieldEvent(
  event: SecureFieldEvent,
  handlers: Pick<SecureTextFieldProps, "onCancel" | "onChange" | "onSave">,
) {
  if (event.type === "cancel") {
    handlers.onCancel();
    return;
  }
  if (event.type === "ready") {
    return;
  }
  if (event.type === "change") {
    handlers.onChange(event.value);
    return;
  }
  handlers.onSave(event.value);
}
