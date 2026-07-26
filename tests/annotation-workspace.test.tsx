import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DraftAnnotation, AnchoredSelection } from "@/features/annotations/annotation";
import { useAnnotationWorkspace } from "@/features/annotations/use-annotation-workspace";
import { createChatGptHost } from "@/features/chatgpt/chatgpt-host";
import { HostProvider } from "@/features/host-port/HostProvider";
import type { IdentifiedConversation } from "@/features/host-port/host-port";
import { I18nProvider } from "@/features/i18n/I18nProvider";

import { installChatGptHostFixture } from "./fixtures/chatgpt-host";

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
      return numberAnnotations(annotations).map((entry) => ({
        ...entry,
        badge: null,
        range: document.createRange(),
        rect: { bottom: 120, height: 20, left: 80, right: 180, top: 100, width: 100 },
      }));
    },
  };
});

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

let workspace: ReturnType<typeof useAnnotationWorkspace>;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  window.history.replaceState({}, "", "/c/conversation-a");
  draftStorage.load.mockReset();
  draftStorage.save.mockReset();
  draftStorage.save.mockResolvedValue();
  Object.defineProperty(document, "execCommand", {
    configurable: true,
    value: vi.fn(() => false),
  });
});

afterEach(() => {
  document.documentElement.lang = "";
  window.history.replaceState({}, "", "/");
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("annotation workspace", () => {
  it("opens an editor and clears selection only after the annotation write succeeds", async () => {
    let resolveLoad: (annotations: DraftAnnotation[]) => void = () => undefined;
    draftStorage.load.mockImplementation(
      () => new Promise<DraftAnnotation[]>((resolve) => (resolveLoad = resolve)),
    );
    const mounted = await mountWorkspace();
    const clearSelection = vi.spyOn(mounted.host.selection, "clear");

    await act(async () => workspace.selection.onActivate(anchoredSelection));
    expect(workspace.editor.status).toBe("hidden");
    expect(clearSelection).not.toHaveBeenCalled();
    expect(draftStorage.save).not.toHaveBeenCalled();

    await act(async () => resolveLoad([]));
    await act(async () => workspace.selection.onActivate(anchoredSelection));
    expect(workspace.editor.status).toBe("quick");
    expect(clearSelection).toHaveBeenCalledOnce();
    expect(draftStorage.save).toHaveBeenCalledOnce();

    await act(async () => mounted.root.unmount());
  });

  it("reads locale changes without reinstalling the send interceptor", async () => {
    draftStorage.load.mockResolvedValue([]);
    installChatGptHostFixture();
    const host = createChatGptHost({ document, window });
    const subscribeToSubmit = vi.spyOn(host.composer, "subscribeToSubmit");
    const mounted = await mountWorkspace(host);

    expect(subscribeToSubmit).toHaveBeenCalledOnce();
    await act(async () => {
      document.documentElement.lang = "zh-CN";
      await Promise.resolve();
    });
    expect(subscribeToSubmit).toHaveBeenCalledOnce();

    await act(async () => mounted.root.unmount());
  });
});

async function mountWorkspace(
  providedHost = createHostWithFixture(),
  container = document.createElement("div"),
) {
  if (!container.isConnected) {
    document.body.append(container);
  }
  const root = createRoot(container);
  await act(async () =>
    root.render(
      <HostProvider host={providedHost}>
        <I18nProvider>
          <WorkspaceProbe />
        </I18nProvider>
      </HostProvider>,
    ),
  );
  return { host: providedHost, root };
}

function createHostWithFixture() {
  installChatGptHostFixture();
  return createChatGptHost({ document, window });
}

function WorkspaceProbe() {
  workspace = useAnnotationWorkspace();
  return null;
}
