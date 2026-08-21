import { useEffect, type Dispatch } from "react";

import type { DemoStatus, InteractiveDemoAction } from "./interactive-demo-state";

export function useInteractiveDemoStatusTimer(
  status: DemoStatus,
  dispatch: Dispatch<InteractiveDemoAction>,
) {
  useEffect(() => {
    const expiration = expirationFor(status.kind);
    if (!expiration) return;

    const timer = window.setTimeout(() => dispatch(expiration.action), expiration.delay);
    return () => window.clearTimeout(timer);
  }, [dispatch, status]);
}

function expirationFor(status: DemoStatus["kind"]): {
  action: InteractiveDemoAction;
  delay: number;
} | null {
  switch (status) {
    case "clear-armed":
      return { action: { type: "expire-clear" }, delay: 3000 };
    case "sending":
      return { action: { type: "complete-send" }, delay: 1100 };
    case "undo":
      return { action: { type: "expire-undo" }, delay: 5000 };
    case "idle":
      return null;
  }
}
