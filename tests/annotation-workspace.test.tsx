import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DraftAnnotation, AnchoredSelection } from "@/features/annotations/annotation";
import { DraftPersistenceProvider } from "@/features/annotations/DraftPersistenceProvider";
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
const annotation: DraftAnnotation = {
  anchor: anchoredSelection.anchor,
  comment: "",
  id: "annotation-one",
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
  it("keeps the editor closed when source navigation fails", async () => {
    draftStoreFixture.store.load.mockResolvedValue([annotation]);
    const host = createWorkspaceHost();
    vi.spyOn(host.selection, "reveal").mockReturnValue({
      status: "unavailable",
    });
    const mounted = await mountWorkspace(host);
    await act(async () => new Promise(requestAnimationFrame));
    const [projection] = workspace.summary.annotations;
    expect(projection?.resolution).toBe("resolved");

    if (projection) {
      await act(async () => workspace.summary.open(projection));
    }

    expect(workspace.editor.status).toBe("hidden");

    await act(async () => mounted.root.unmount());
  });

  it("keeps the current editor target when its session refuses dismissal", async () => {
    const other: DraftAnnotation = { ...annotation, comment: "other", id: "annotation-two" };
    draftStoreFixture.store.load.mockResolvedValue([annotation, other]);
    const mounted = await mountWorkspace();
    await act(async () => new Promise(requestAnimationFrame));
    const [first, second] = workspace.summary.annotations;
    if (!first || !second) {
      throw new Error("Missing projections");
    }

    await act(async () => workspace.summary.open(first));
    expect(workspace.editor.projection?.annotation.id).toBe(annotation.id);

    let isDismissalAllowed = false;
    act(() => workspace.editor.bindSession(() => isDismissalAllowed));
    await act(async () => workspace.summary.open(second));
    expect(workspace.editor.projection?.annotation.id).toBe(annotation.id);

    isDismissalAllowed = true;
    await act(async () => workspace.summary.open(second));
    expect(workspace.editor.projection?.annotation.id).toBe(other.id);

    await act(async () => mounted.root.unmount());
  });

  it("closes an active editor after annotation resolution fails", async () => {
    draftStoreFixture.store.load.mockResolvedValue([]);
    const mounted = await mountWorkspace();
    mounted.host.controls.setMessageIndex(new Map());

    await act(async () => workspace.selection.onActivate(anchoredSelection));
    expect(workspace.editor.status).toBe("quick");
    expect(workspace.editor.projection?.resolution).toBe("pending");

    await act(async () => new Promise(requestAnimationFrame));
    expect(workspace.editor.status).toBe("hidden");

    await act(async () => mounted.root.unmount());
  });

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
    expect(draftStoreFixture.store.mutate).not.toHaveBeenCalled();

    await act(async () => resolveLoad([]));
    await act(async () => workspace.selection.onActivate(anchoredSelection));
    expect(workspace.editor.status).toBe("quick");
    expect(clearSelection).toHaveBeenCalledOnce();
    expect(draftStoreFixture.store.mutate).toHaveBeenCalledOnce();

    await act(async () => new Promise(requestAnimationFrame));
    expect(workspace.editor.status).toBe("quick");
    expect(workspace.editor.projection?.resolution).toBe("resolved");

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

  it("clears failed send state when the draft is cleared", async () => {
    draftStoreFixture.store.load.mockResolvedValue([annotation]);
    const host = createWorkspaceHost();
    vi.spyOn(host.composer, "submit").mockResolvedValue({
      reason: "send-unavailable",
      status: "unavailable",
    });
    const mounted = await mountWorkspace(host);
    await act(async () => new Promise(requestAnimationFrame));

    await act(async () => workspace.summary.send());
    await vi.waitFor(() => expect(workspace.summary.sendState.status).toBe("failed"));

    await act(async () => workspace.summary.clear());
    await vi.waitFor(() => expect(workspace.summary.sendState.status).toBe("idle"));

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
      <DraftPersistenceProvider store={draftStoreFixture.store}>
        <HostProvider host={providedHost}>
          <I18nProvider>
            <WorkspaceProbe />
          </I18nProvider>
        </HostProvider>
      </DraftPersistenceProvider>,
    ),
  );
  return { host: providedHost, root };
}

function createWorkspaceHost(): FakeHost {
  const host = createFakeHost({
    conversation: {
      identity: () => ({ kind: "identified", id: "conversation-a", siteId: "chatgpt" }),
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
