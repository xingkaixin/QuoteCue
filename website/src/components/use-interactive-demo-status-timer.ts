import { useEffect, type Dispatch } from "react";

import type { InteractiveDemoAction, InteractiveDemoState } from "./interactive-demo-state";

const CLEAR_CONFIRMATION_DURATION_MS = 3_000;
const SEND_DURATION_MS = 1_100;
const UNDO_DURATION_MS = 5_000;

export function useInteractiveDemoStatusTimer(
  state: Pick<InteractiveDemoState, "clearArmed" | "pendingRemovals" | "send">,
  dispatch: Dispatch<InteractiveDemoAction>,
) {
  useEffect(() => {
    if (!state.clearArmed) return;

    const timer = window.setTimeout(
      () => dispatch({ type: "expire-clear" }),
      CLEAR_CONFIRMATION_DURATION_MS,
    );
    return () => window.clearTimeout(timer);
  }, [dispatch, state.clearArmed]);

  useEffect(() => {
    if (state.send.kind !== "sending") return;

    const timer = window.setTimeout(() => dispatch({ type: "complete-send" }), SEND_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [dispatch, state.send]);

  useEffect(() => {
    if (state.pendingRemovals.length === 0) return;

    const timer = window.setTimeout(() => dispatch({ type: "expire-undo" }), UNDO_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [dispatch, state.pendingRemovals]);
}
