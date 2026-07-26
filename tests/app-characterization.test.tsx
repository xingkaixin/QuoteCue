import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "@/entrypoints/content/App";
import type { DraftAnnotation, SelectionDraft } from "@/features/annotations/annotation";
import type { ProjectedAnnotation } from "@/features/annotations/annotation-projection";
import { createChatGptHost } from "@/features/chatgpt/chatgpt-host";
import { HostProvider } from "@/features/host-port/HostProvider";
import type { IdentifiedConversation } from "@/features/host-port/host-port";
import { I18nProvider } from "@/features/i18n/I18nProvider";

import { appendUserMessage, installChatGptHostFixture } from "./fixtures/chatgpt-host";

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

vi.mock("@/features/annotations/use-annotation-projection", async () => {
  const { numberAnnotations } = await import("@/features/annotations/annotation-projection");
  return {
    useAnnotationProjection(annotations: readonly DraftAnnotation[]) {
      return numberAnnotations(annotations).map<ProjectedAnnotation>((entry) => ({
        ...entry,
        badge: null,
        range: document.createRange(),
        rect: { bottom: 120, height: 20, left: 80, right: 180, top: 100, width: 100 },
      }));
    },
  };
});

vi.mock("@/features/host/use-annotated-composer-layout", () => ({
  useAnnotatedComposerLayout(isActive: boolean) {
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
  },
}));

vi.mock("@/features/annotations/SelectionPresentation", () => ({
  SelectionPresentation({
    isEnabled,
    onActivate,
  }: {
    isEnabled: boolean;
    onActivate: (draft: SelectionDraft) => void;
  }) {
    return (
      <button
        data-testid="start-annotation"
        disabled={!isEnabled}
        onClick={() => onActivate(selectionDraft)}
        type="button"
      >
        Start annotation
      </button>
    );
  },
}));

vi.mock("@/features/annotations/AnnotationQuickInput", () => ({
  AnnotationQuickInput({
    onClose,
    onSave,
  }: {
    onClose: () => void;
    onSave: (comment: string) => void;
  }) {
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
  AnnotationEditor({ onCancel }: { onCancel: () => void }) {
    return (
      <button data-testid="expanded-editor" onClick={onCancel} type="button">
        Expanded editor
      </button>
    );
  },
}));

vi.mock("@/features/annotations/AnnotationBadge", () => ({
  AnnotationBadge({
    entry,
    onEdit,
  }: {
    entry: ProjectedAnnotation;
    onEdit: (annotation: ProjectedAnnotation) => void;
  }) {
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
    onSend,
    onUndo,
    pendingDeletionCount,
    sendStatus,
  }: {
    annotations: readonly ProjectedAnnotation[];
    onRemove: (annotationId: string) => void;
    onSend: () => void;
    onUndo: () => void;
    pendingDeletionCount: number;
    sendStatus: string;
  }) {
    return (
      <section
        data-count={annotations.length}
        data-pending={pendingDeletionCount}
        data-send-status={sendStatus}
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
        <button data-testid="send-annotations" onClick={onSend} type="button">
          Send
        </button>
        <button data-testid="undo-deletion" onClick={onUndo} type="button">
          Undo
        </button>
      </section>
    );
  },
}));

const selectionDraft: SelectionDraft = {
  anchor: {
    end: 16,
    messageId: "assistant-one",
    prefix: "A ",
    quote: "focused answer",
    start: 2,
    suffix: " for the contract fixture.",
  },
  rect: { bottom: 120, height: 20, left: 80, right: 180, top: 100, width: 100 },
};

const storedDrafts = new Map<string, DraftAnnotation[]>();

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
});

afterEach(() => {
  vi.useRealTimers();
  window.history.replaceState({}, "", "/");
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("App annotation workflow", () => {
  it("clears only confirmed annotations and closes the editor", async () => {
    const mounted = await mountApp();
    mounted.fixture.action.addEventListener("click", () => {
      appendUserMessage("confirmed-send", mounted.fixture.composer.innerText);
    });

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
    expect(mounted.fixture.composer.innerText).toContain("[Annotation 1]");
    expect(storedDrafts.get("conversation-a")).toHaveLength(1);

    await act(async () => mounted.root.unmount());
  });

  it("keeps drafts and routes the next send through retry after failure", async () => {
    const mounted = await mountApp();
    const replaceText = vi.spyOn(mounted.host.composer, "replaceText").mockReturnValue(false);

    await click(mounted.container, "start-annotation");
    await click(mounted.container, "send-annotations");

    expect(summary(mounted.container).dataset.sendStatus).toBe("failed");
    expect(summary(mounted.container).dataset.count).toBe("1");
    expect(mounted.container.querySelector('[data-testid="quick-editor"]')).not.toBeNull();
    expect(storedDrafts.get("conversation-a")).toHaveLength(1);

    await click(mounted.container, "send-annotations");
    expect(replaceText).toHaveBeenCalledTimes(2);
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

    await act(async () => window.history.pushState({}, "", "/c/conversation-b"));
    await vi.waitFor(() => {
      expect(mounted.container.querySelector('[data-testid="annotation-summary"]')).toBeNull();
      expect(mounted.container.querySelector('[data-testid="quick-editor"]')).toBeNull();
    });

    await act(async () => window.history.pushState({}, "", "/c/conversation-a"));
    await vi.waitFor(() => {
      expect(summary(mounted.container).dataset.count).toBe("2");
      expect(summary(mounted.container).dataset.pending).toBe("0");
    });
    expect(mounted.container.querySelector('[data-testid="quick-editor"]')).toBeNull();

    await act(async () => mounted.root.unmount());
  });
});

async function mountApp() {
  const fixture = installChatGptHostFixture();
  const host = createChatGptHost({ document, window });
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

  return { container, fixture, host, root };
}

async function click(container: HTMLElement, testId: string) {
  const button = container.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`);
  if (!button) {
    throw new Error(`Missing ${testId}`);
  }
  await act(async () => button.click());
}

function summary(container: HTMLElement) {
  const element = container.querySelector<HTMLElement>('[data-testid="annotation-summary"]');
  if (!element) {
    throw new Error("Missing annotation summary");
  }
  return element;
}

function cloneAnnotations(annotations: readonly DraftAnnotation[]) {
  return annotations.map((annotation) => ({
    ...annotation,
    anchor: { ...annotation.anchor },
  }));
}
