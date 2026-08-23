import { isRecord } from "@/lib/is-record";

export const SECURE_FIELD_INIT = "quotecue:secure-field:init";

export type SecureFieldConfig = {
  ariaLabel: string;
  kind: "input" | "textarea";
  lang: string;
  maxLength?: number;
  name: string;
  placeholder: string;
  theme: "dark" | "light";
  value: string;
};

export type SecureFieldUpdate = Pick<
  SecureFieldConfig,
  "ariaLabel" | "lang" | "placeholder" | "theme" | "value"
>;

export type SecureFieldInitMessage = {
  type: typeof SECURE_FIELD_INIT;
  token: string;
  config: SecureFieldConfig;
};

export type SecureFieldCommand = { type: "focus" } | { type: "update"; update: SecureFieldUpdate };

export type SecureFieldEvent =
  | { type: "cancel" }
  | { type: "change"; value: string }
  | { type: "save"; value: string };

export function decodeSecureFieldInit(
  value: unknown,
  token: string,
): SecureFieldInitMessage | null {
  if (!isRecord(value) || value.type !== SECURE_FIELD_INIT || value.token !== token) {
    return null;
  }
  const config = decodeConfig(value.config);
  return config ? { type: SECURE_FIELD_INIT, token, config } : null;
}

export function decodeSecureFieldCommand(value: unknown): SecureFieldCommand | null {
  if (!isRecord(value)) {
    return null;
  }
  if (value.type === "focus") {
    return { type: "focus" };
  }
  const update = value.type === "update" ? decodeUpdate(value.update) : null;
  return update ? { type: "update", update } : null;
}

export function decodeSecureFieldEvent(value: unknown): SecureFieldEvent | null {
  if (!isRecord(value)) {
    return null;
  }
  if (value.type === "cancel") {
    return { type: value.type };
  }
  if ((value.type === "change" || value.type === "save") && typeof value.value === "string") {
    return { type: value.type, value: value.value };
  }
  return null;
}

function decodeConfig(value: unknown): SecureFieldConfig | null {
  const update = decodeUpdate(value);
  if (
    !isRecord(value) ||
    !update ||
    (value.kind !== "input" && value.kind !== "textarea") ||
    (value.maxLength !== undefined && !isPositiveSafeInteger(value.maxLength)) ||
    typeof value.name !== "string"
  ) {
    return null;
  }
  return {
    ...update,
    kind: value.kind,
    ...(value.maxLength === undefined ? {} : { maxLength: value.maxLength }),
    name: value.name,
  };
}

function decodeUpdate(value: unknown): SecureFieldUpdate | null {
  if (
    !isRecord(value) ||
    typeof value.ariaLabel !== "string" ||
    typeof value.lang !== "string" ||
    typeof value.placeholder !== "string" ||
    (value.theme !== "dark" && value.theme !== "light") ||
    typeof value.value !== "string"
  ) {
    return null;
  }
  return {
    ariaLabel: value.ariaLabel,
    lang: value.lang,
    placeholder: value.placeholder,
    theme: value.theme,
    value: value.value,
  };
}

function isPositiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}
