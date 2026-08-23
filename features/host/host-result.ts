import type { ComposerSubmitFailureReason } from "@/features/host-port/host-port";

import type { HostEnvironment } from "./host-environment";

type HostDiagnosticReason =
  | "anchor-unavailable"
  | "assistant-message-unavailable"
  | "composer-surface-unavailable"
  | "composer-unavailable"
  | "selection-detached"
  | "selection-unavailable"
  | "send-control-unavailable";

export function available<T>(value: T): { status: "available"; value: T } {
  return { status: "available", value };
}

export function unavailable(
  reason: HostDiagnosticReason,
  logger?: HostEnvironment["logger"],
): { status: "unavailable" } {
  logger?.(`[QuoteCue host] unavailable: ${reason}`);
  return { status: "unavailable" };
}

export function failure<R extends ComposerSubmitFailureReason>(
  reason: R,
): { reason: R; status: "unavailable" } {
  return { reason, status: "unavailable" };
}
