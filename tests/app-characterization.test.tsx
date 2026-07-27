import { act, type ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "@/entrypoints/content/App";
import type { DraftAnnotation, AnchoredSelection } from "@/features/annotations/annotation";
import { HostProvider } from "@/features/host-port/HostProvider";
import type { IdentifiedConversation } from "@/features/host-port/host-port";
import { I18nProvider } from "@/features/i18n/I18nProvider";

import { createFakeHost, type FakeHost } from "./fixtures/fake-host";

const draftStorage = vi.hoisted(() => ({
  load: vi.fn<(conversation: IdentifiedConversation) => Promise<DraftAnnotation[]>>(),
  save: vi.fn<
    (conversation: IdentifiedConversation, annotations: DraftAnnotation[]) => Promise<void>
  >(),
}));

vi.mock("@/features/annotations/draft-storage", () => ({
  loadDraftAnnotations: draftStorage.load,
  saveDraftAnnotations: draftStorage.save,
}));

type AnnotationBadgeProps = ComponentProps<
  (typeof import("@/features/annotations/AnnotationBadge"))["AnnotationBadge"]
>;
type AnnotationEditorProps = ComponentProps<
  (typeof import("@/features/annotations/AnnotationEditor"))["AnnotationEditor"]
>;
type AnnotationQuickInputProps = ComponentProps<
  (typeof import("@/features/annotations/AnnotationQuickInput"))["AnnotationQuickInput"]
>;
type AnnotationSendControlProps = ComponentProps<
  (typeof import("@/features/annotations/AnnotationSendControl"))["AnnotationSendControl"]
>;
type AnnotationSummaryProps = ComponentProps<
  (typeof import("@/features/annotations/AnnotationSummary"))["AnnotationSummary"]
>;
type SelectionPresentationProps = ComponentProps<
  (typeof import("@/features/annotations/SelectionPresentation"))["SelectionPresentation"]
>;

vi.mock("@/features/host/use-annotated-composer-layout", () => {
  const useAnnotatedComposerLayout: (typeof import("@/features/host/use-annotated-composer-layout"))["useAnnotatedComposerLayout"] =
    (isActive) => {
      return isActive
        ? {
            send: {
              bottom: 236,
              height: 36,
              left: 200,
              right: 236,
              top: 200,
              width: 36,
            },
            summary: { left: 10, top: 10 },
          }
        : null;
    };
  return { useAnnotatedComposerLayout };
});

vi.mock("@/features/annotations/SelectionPresentation", () => ({
  SelectionPresentation({ isEnabled, onActivate }: SelectionPresentationProps) {
    return (
      <button
        data-testid="start-annotation"
        disabled={!isEnabled}
        onClick={() => onActivate(anchoredSelection)}
        type="button"
      >
        Start annotation
      </button>
    );
  },
}));

vi.mock("@/features/annotations/AnnotationQuickInput", () => ({
  AnnotationQuickInput({ onClose, onSave }: AnnotationQuickInputProps) {
    return (
      <div data-testid="quick-editor">
        <button data-testid="save-quick" onClick={() => onSave("saved comment")} type="button">
          Save
        </button>
        <button onClick={onClose} type="button">
          Close
        </button>
      </div>
    );
  },
}));

vi.mock("@/features/annotations/AnnotationEditor", () => ({
  AnnotationEditor({ onCancel }: AnnotationEditorProps) {
    return (
      <button data-testid="expanded-editor" onClick={onCancel} type="button">
        Expanded editor
      </button>
    );
  },
}));

vi.mock("@/features/annotations/AnnotationBadge", () => ({
  AnnotationBadge({ entry, onEdit }: AnnotationBadgeProps) {
    return (
      <button data-testid={`badge-${entry.ordinal}`} onClick={() => onEdit(entry)} type="button">
        {entry.ordinal}
      </button>
    );
  },
}));

vi.mock("@/features/annotations/AnnotationSummary", () => ({
  AnnotationSummary({
    annotations,
    onRemove,
    onUndo,
    pendingDeletionCount,
  }: AnnotationSummaryProps) {
    return (
      <section
        data-count={annotations.length}
        data-pending={pendingDeletionCount}
        data-testid="annotation-summary"
      >
        <button
          data-testid="delete-first"
          disabled={annotations.length === 0}
          onClick={() => {
            const first = annotations[0];
            if (first) {
              onRemove(first.annotation.id);
            }
          }}
          type="button"
        >
          Delete
        </button>
        <button data-testid="undo-deletion" onClick={onUndo} type="button">
          Undo
        </button>
      </section>
    );
  },
}));

vi.mock("@/features/annotations/AnnotationSendControl", () => ({
  AnnotationSendControl({ onSend, state }: AnnotationSendControlProps) {
    return (
      <button
        data-send-state={state.status}
        data-testid="send-annotations"
        onClick={onSend}
        type="button"
      >
        Send
      </button>
    );
  },
}));

const anchoredSelection: AnchoredSelection = {
  anchor: {
    end: 16,
    format: "exact",
    messageId: "assistant-one",
    prefix: "A ",
    quote: "focused answer",
    start: 2,
    suffix: " for the contract fixture.",
  },
  rect: { bottom: 120, height: 20, left: 80, right: 180, top: 100, width: 100 },
};

const storedDrafts = new Map<string, DraftAnnotation[]>();
const rangeRectsDescriptor = Object.getOwnPropertyDescriptor(Range.prototype, "getClientRects");

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  window.history.replaceState({}, "", "/c/conversation-a");
  storedDrafts.clear();
  draftStorage.load.mockReset();
  draftStorage.save.mockReset();
  draftStorage.load.mockImplementation(async (conversation: IdentifiedConversation) =>
    cloneAnnotations(storedDrafts.get(conversation.id) ?? []),
  );
  draftStorage.save.mockImplementation(
    async (conversation: IdentifiedConversation, annotations: DraftAnnotation[]) => {
      storedDrafts.set(conversation.id, cloneAnnotations(annotations));
    },
  );
  Object.defineProperty(document, "execCommand", {
    configurable: true,
    value: vi.fn(() => false),
  });
  vi.stubGlobal("ClipboardEvent", undefined);
  vi.stubGlobal("DataTransfer", undefined);
  vi.stubGlobal("CSS", {});
  Object.defineProperty(Range.prototype, "getClientRects", {
    configurable: true,
    value: () => [new DOMRect(80, 100, 100, 20)],
  });
});

afterEach(() => {
  vi.useRealTimers();
  window.history.replaceState({}, "", "/");
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (rangeRectsDescriptor) {
    Object.defineProperty(Range.prototype, "getClientRects", rangeRectsDescriptor);
  } else {
    Reflect.deleteProperty(Range.prototype, "getClientRects");
  }
});

describe("App annotation workflow", () => {
  it("clears only confirmed annotations and closes the editor", async () => {
    const mounted = await mountApp();

    await click(mounted.container, "start-annotation");
    await click(mounted.container, "start-annotation");
    expect(summary(mounted.container).dataset.count).toBe("2");
    expect(mounted.container.querySelector('[data-testid="quick-editor"]')).not.toBeNull();

    await click(mounted.container, "delete-first");
    expect(summary(mounted.container).dataset.pending).toBe("1");
    expect(summary(mounted.container).dataset.count).toBe("1");

    await click(mounted.container, "send-annotations");
    await vi.waitFor(() => {
      expect(summary(mounted.container).dataset.count).toBe("0");
      expect(summary(mounted.container).dataset.pending).toBe("1");
    });

    expect(mounted.container.querySelector('[data-testid="quick-editor"]')).toBeNull();
    expect(mounted.host.elements.composer.textContent).toContain("[Annotation 1]");
    expect(storedDrafts.get("conversation-a")).toHaveLength(1);

    await act(async () => mounted.root.unmount());
  });

  it("keeps drafts and routes the next send through retry after failure", async () => {
    const mounted = await mountApp();
    const submit = vi.spyOn(mounted.host.composer, "submit").mockResolvedValue({
      reason: "replace-failed",
      status: "unavailable",
    });

    await click(mounted.container, "start-annotation");
    await click(mounted.container, "send-annotations");

    expect(sendControl(mounted.container).dataset.sendState).toBe("failed");
    expect(summary(mounted.container).dataset.count).toBe("1");
    expect(mounted.container.querySelector('[data-testid="quick-editor"]')).not.toBeNull();
    expect(storedDrafts.get("conversation-a")).toHaveLength(1);

    await click(mounted.container, "send-annotations");
    expect(submit).toHaveBeenCalledTimes(2);
    expect(summary(mounted.container).dataset.count).toBe("1");

    await act(async () => mounted.root.unmount());
  });

  it("resets editor and pending deletion state when the conversation changes", async () => {
    const mounted = await mountApp();

    await click(mounted.container, "start-annotation");
    await click(mounted.container, "start-annotation");
    await click(mounted.container, "delete-first");
    expect(summary(mounted.container).dataset.pending).toBe("1");
    expect(mounted.container.querySelector('[data-testid="quick-editor"]')).not.toBeNull();

    await act(async () =>
      mounted.host.controls.setConversationIdentity({
        kind: "identified",
        id: "conversation-b",
      }),
    );
    await vi.waitFor(() => {
      expect(mounted.container.querySelector('[data-testid="annotation-summary"]')).toBeNull();
      expect(mounted.container.querySelector('[data-testid="quick-editor"]')).toBeNull();
    });

    await act(async () =>
      mounted.host.controls.setConversationIdentity({
        kind: "identified",
        id: "conversation-a",
      }),
    );
    await vi.waitFor(() => {
      expect(summary(mounted.container).dataset.count).toBe("2");
      expect(summary(mounted.container).dataset.pending).toBe("0");
    });
    expect(mounted.container.querySelector('[data-testid="quick-editor"]')).toBeNull();

    await act(async () => mounted.root.unmount());
  });

  it("keeps an active send visible and alive when the conversation changes", async () => {
    const mounted = await mountApp();
    const subscribeToSubmit = vi.spyOn(mounted.host.composer, "subscribeToSubmit");
    let pendingSubmit: Parameters<FakeHost["composer"]["submit"]>[0] | undefined;
    let confirmSubmit: (() => void) | undefined;
    vi.spyOn(mounted.host.composer, "submit").mockImplementation((options) => {
      pendingSubmit = options;
      return new Promise((resolve) => {
        confirmSubmit = () => resolve({ status: "available", value: "confirmed" });
      });
    });

    await click(mounted.container, "start-annotation");
    const sentSnapshot = cloneAnnotations(storedDrafts.get("conversation-a") ?? []);
    storedDrafts.set("conversation-c", cloneAnnotations(sentSnapshot));
    await click(mounted.container, "send-annotations");
    expect(sendControl(mounted.container).dataset.sendState).toBe("awaiting-confirmation");

    await act(async () =>
      mounted.host.controls.setConversationIdentity({
        kind: "identified",
        id: "conversation-b",
      }),
    );
    await vi.waitFor(() => {
      expect(mounted.container.querySelector('[data-testid="annotation-summary"]')).toBeNull();
    });
    expect(sendControl(mounted.container).dataset.sendState).toBe("awaiting-confirmation");

    await act(async () =>
      mounted.host.controls.setConversationIdentity({
        kind: "identified",
        id: "conversation-c",
      }),
    );
    await vi.waitFor(() => expect(summary(mounted.container).dataset.count).toBe("1"));

    expect(sendControl(mounted.container).dataset.sendState).toBe("awaiting-confirmation");
    expect(pendingSubmit?.signal.aborted).toBe(false);
    expect(subscribeToSubmit).not.toHaveBeenCalled();

    await act(async () => confirmSubmit?.());
    await vi.waitFor(() =>
      expect(sendControl(mounted.container).dataset.sendState).toBe("confirmed"),
    );
    expect(summary(mounted.container).dataset.count).toBe("1");
    expect(storedDrafts.get("conversation-c")).toEqual(sentSnapshot);

    await act(async () => mounted.root.unmount());
  });
});

async function mountApp() {
  const host = createAppHost();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

  await act(async () =>
    root.render(
      <HostProvider host={host}>
        <I18nProvider>
          <App />
        </I18nProvider>
      </HostProvider>,
    ),
  );
  await vi.waitFor(() => {
    expect(
      container.querySelector<HTMLButtonElement>('[data-testid="start-annotation"]')?.disabled,
    ).toBe(false);
  });

  return { container, host, root };
}

async function click(container: HTMLElement, testId: string) {
  const button = container.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`);
  if (!button) {
    throw new Error(`Missing ${testId}`);
  }
  await act(async () => button.click());
  await act(async () => nextFrame());
}

function summary(container: HTMLElement) {
  const element = container.querySelector<HTMLElement>('[data-testid="annotation-summary"]');
  if (!element) {
    throw new Error("Missing annotation summary");
  }
  return element;
}

function sendControl(container: HTMLElement) {
  const element = container.querySelector<HTMLElement>('[data-testid="send-annotations"]');
  if (!element) {
    throw new Error("Missing annotation send control");
  }
  return element;
}

function cloneAnnotations(annotations: readonly DraftAnnotation[]) {
  return annotations.map((annotation) => ({
    ...annotation,
    anchor: { ...annotation.anchor },
  }));
}

function createAppHost(): FakeHost {
  const host = createFakeHost();
  host.controls.setConversationIdentity({ kind: "identified", id: "conversation-a" });
  const message = document.createElement("article");
  message.textContent = "A focused answer for the contract fixture.";
  document.body.append(message);
  host.controls.setMessageIndex(new Map([["assistant-one", message]]));
  return host;
}

function nextFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}
