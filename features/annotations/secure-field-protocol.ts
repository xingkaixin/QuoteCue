export const SECURE_FIELD_INIT = "quotecue:secure-field:init";

export type SecureFieldConfig = {
  ariaLabel: string;
  kind: "input" | "textarea";
  placeholder: string;
  value: string;
};

export type SecureFieldInitMessage = {
  type: typeof SECURE_FIELD_INIT;
  token: string;
  config: SecureFieldConfig;
};

export type SecureFieldCommand = { type: "focus" } | { type: "set-value"; value: string };

export type SecureFieldEvent =
  | { type: "cancel" }
  | { type: "change"; value: string }
  | { type: "ready" }
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
  return value.type === "set-value" && typeof value.value === "string"
    ? { type: "set-value", value: value.value }
    : null;
}

export function decodeSecureFieldEvent(value: unknown): SecureFieldEvent | null {
  if (!isRecord(value)) {
    return null;
  }
  if (value.type === "cancel" || value.type === "ready") {
    return { type: value.type };
  }
  if ((value.type === "change" || value.type === "save") && typeof value.value === "string") {
    return { type: value.type, value: value.value };
  }
  return null;
}

function decodeConfig(value: unknown): SecureFieldConfig | null {
  if (
    !isRecord(value) ||
    (value.kind !== "input" && value.kind !== "textarea") ||
    typeof value.ariaLabel !== "string" ||
    typeof value.placeholder !== "string" ||
    typeof value.value !== "string"
  ) {
    return null;
  }
  return {
    ariaLabel: value.ariaLabel,
    kind: value.kind,
    placeholder: value.placeholder,
    value: value.value,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
