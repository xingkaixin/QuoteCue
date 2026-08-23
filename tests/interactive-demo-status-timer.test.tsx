import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  initialInteractiveDemoState,
  type DemoAnnotation,
  type InteractiveDemoAction,
  type InteractiveDemoState,
} from "../website/src/components/interactive-demo-state";
import { useInteractiveDemoStatusTimer } from "../website/src/components/use-interactive-demo-status-timer";

const annotation: DemoAnnotation = {
  id: 1,
  comment: "",
  range: document.createRange(),
  text: "selected answer",
};

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe("interactive demo status timer", () => {
  it.each([
    ["clear confirmation", { clearArmed: true }, 3000, { type: "expire-clear" }],
    [
      "send progress",
      { send: { kind: "sending", prompt: "compiled" } },
      1100,
      { type: "complete-send" },
    ],
    ["undo", { pendingRemovals: [{ annotation, index: 0 }] }, 5000, { type: "expire-undo" }],
  ] as const)("expires %s after its configured delay", async (_, state, delay, action) => {
    const dispatch = vi.fn();
    const root = createRoot(document.body.appendChild(document.createElement("div")));

    await act(async () => root.render(<TimerHarness dispatch={dispatch} state={state} />));
    await act(async () => vi.advanceTimersByTimeAsync(delay - 1));
    expect(dispatch).not.toHaveBeenCalled();

    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(dispatch).toHaveBeenCalledWith(action);

    await act(async () => root.unmount());
  });

  it("cancels clear expiration when confirmation is dismissed", async () => {
    const dispatch = vi.fn();
    const root = createRoot(document.body.appendChild(document.createElement("div")));

    await act(async () =>
      root.render(<TimerHarness dispatch={dispatch} state={{ clearArmed: true }} />),
    );
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    await act(async () =>
      root.render(<TimerHarness dispatch={dispatch} state={{ clearArmed: false }} />),
    );
    await act(async () => vi.advanceTimersByTimeAsync(3000));

    expect(dispatch).not.toHaveBeenCalled();
    await act(async () => root.unmount());
  });

  it("expires clear confirmation and undo independently", async () => {
    const dispatch = vi.fn();
    const root = createRoot(document.body.appendChild(document.createElement("div")));

    await act(async () =>
      root.render(
        <TimerHarness
          dispatch={dispatch}
          state={{
            clearArmed: true,
            pendingRemovals: [{ annotation, index: 0 }],
          }}
        />,
      ),
    );
    await act(async () => vi.advanceTimersByTimeAsync(3000));
    expect(dispatch).toHaveBeenCalledWith({ type: "expire-clear" });
    expect(dispatch).not.toHaveBeenCalledWith({ type: "expire-undo" });

    await act(async () => vi.advanceTimersByTimeAsync(2000));
    expect(dispatch).toHaveBeenCalledWith({ type: "expire-undo" });

    await act(async () => root.unmount());
  });
});

function TimerHarness({
  dispatch,
  state,
}: {
  dispatch: (action: InteractiveDemoAction) => void;
  state: Partial<InteractiveDemoState>;
}) {
  useInteractiveDemoStatusTimer(
    {
      clearArmed: state.clearArmed ?? initialInteractiveDemoState.clearArmed,
      pendingRemovals: state.pendingRemovals ?? initialInteractiveDemoState.pendingRemovals,
      send: state.send ?? initialInteractiveDemoState.send,
    },
    dispatch,
  );
  return null;
}
