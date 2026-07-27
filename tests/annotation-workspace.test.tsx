import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DraftAnnotation, AnchoredSelection } from "@/features/annotations/annotation";
import { DraftStoreProvider } from "@/features/annotations/DraftStoreProvider";
import { useAnnotationWorkspace } from "@/features/annotations/use-annotation-workspace";
import { HostProvider } from "@/features/host-port/HostProvider";
import { I18nProvider } from "@/features/i18n/I18nProvider";

import { createFakeHost, type FakeHost } from "./fixtures/fake-host";
import { createDraftStoreDouble } from "./fixtures/memory-draft-store";

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
let draftStoreFixture = createDraftStoreDouble();

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  window.history.replaceState({}, "", "/c/conversation-a");
  draftStoreFixture = createDraftStoreDouble();
  Object.defineProperty(document, "execCommand", {
    configurable: true,
    value: vi.fn(() => false),
  });
  vi.stubGlobal("CSS", {});
});

afterEach(() => {
  document.documentElement.lang = "";
  window.history.replaceState({}, "", "/");
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("annotation workspace", () => {
  it("opens an editor and clears selection only after the annotation write succeeds", async () => {
    let resolveLoad: (annotations: DraftAnnotation[]) => void = () => undefined;
    draftStoreFixture.store.load.mockImplementation(
      () => new Promise<DraftAnnotation[]>((resolve) => (resolveLoad = resolve)),
    );
    const mounted = await mountWorkspace();
    const clearSelection = vi.spyOn(mounted.host.selection, "clear");

    await act(async () => workspace.selection.onActivate(anchoredSelection));
    expect(workspace.editor.status).toBe("hidden");
    expect(clearSelection).not.toHaveBeenCalled();
    expect(draftStoreFixture.store.save).not.toHaveBeenCalled();

    await act(async () => resolveLoad([]));
    await act(async () => workspace.selection.onActivate(anchoredSelection));
    expect(workspace.editor.status).toBe("quick");
    expect(clearSelection).toHaveBeenCalledOnce();
    expect(draftStoreFixture.store.save).toHaveBeenCalledOnce();

    await act(async () => mounted.root.unmount());
  });

  it("reads locale changes without reinstalling the send interceptor", async () => {
    draftStoreFixture.store.load.mockResolvedValue([]);
    const host = createWorkspaceHost();
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
  providedHost = createWorkspaceHost(),
  container = document.createElement("div"),
) {
  if (!container.isConnected) {
    document.body.append(container);
  }
  const root = createRoot(container);
  await act(async () =>
    root.render(
      <DraftStoreProvider store={draftStoreFixture.store}>
        <HostProvider host={providedHost}>
          <I18nProvider>
            <WorkspaceProbe />
          </I18nProvider>
        </HostProvider>
      </DraftStoreProvider>,
    ),
  );
  return { host: providedHost, root };
}

function createWorkspaceHost(): FakeHost {
  const host = createFakeHost({
    conversation: {
      identity: () => ({ kind: "identified", id: "conversation-a" }),
    },
  });
  const message = document.createElement("article");
  message.textContent = "A focused answer for the contract fixture.";
  document.body.append(message);
  host.controls.setMessageIndex(new Map([["assistant-one", message]]));
  return host;
}

function WorkspaceProbe() {
  workspace = useAnnotationWorkspace();
  return null;
}
