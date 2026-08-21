import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  DemoAnnotation,
  DemoStatus,
  InteractiveDemoAction,
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
    ["clear confirmation", { kind: "clear-armed" }, 3000, { type: "expire-clear" }],
    ["send progress", { kind: "sending", prompt: "compiled" }, 1100, { type: "complete-send" }],
    ["undo", { kind: "undo", annotation, index: 0 }, 5000, { type: "expire-undo" }],
  ] as const)("expires %s after its configured delay", async (_, status, delay, action) => {
    const dispatch = vi.fn();
    const root = createRoot(document.body.appendChild(document.createElement("div")));

    await act(async () => root.render(<TimerHarness dispatch={dispatch} status={status} />));
    await act(async () => vi.advanceTimersByTimeAsync(delay - 1));
    expect(dispatch).not.toHaveBeenCalled();

    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(dispatch).toHaveBeenCalledWith(action);

    await act(async () => root.unmount());
  });

  it("cancels an expiration when the status changes", async () => {
    const dispatch = vi.fn();
    const root = createRoot(document.body.appendChild(document.createElement("div")));

    await act(async () =>
      root.render(<TimerHarness dispatch={dispatch} status={{ kind: "clear-armed" }} />),
    );
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    await act(async () =>
      root.render(<TimerHarness dispatch={dispatch} status={{ kind: "idle" }} />),
    );
    await act(async () => vi.advanceTimersByTimeAsync(3000));

    expect(dispatch).not.toHaveBeenCalled();
    await act(async () => root.unmount());
  });
});

function TimerHarness({
  dispatch,
  status,
}: {
  dispatch: (action: InteractiveDemoAction) => void;
  status: DemoStatus;
}) {
  useInteractiveDemoStatusTimer(status, dispatch);
  return null;
}
