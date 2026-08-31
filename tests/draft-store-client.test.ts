import { beforeEach, describe, expect, it, vi } from "vitest";

import { DRAFT_OWNER_MESSAGE } from "@/features/annotations/draft-owner-protocol";
import { createBrowserDraftStore } from "@/features/annotations/draft-store-client";

const sendMessage = vi.hoisted(() => vi.fn());
const storageChanges = vi.hoisted(() => {
  const listeners = new Set<(changes: Record<string, unknown>, areaName: string) => void>();
  return {
    addListener: vi.fn((listener: (changes: Record<string, unknown>, areaName: string) => void) =>
      listeners.add(listener),
    ),
    removeListener: vi.fn(
      (listener: (changes: Record<string, unknown>, areaName: string) => void) =>
        listeners.delete(listener),
    ),
    emit(changes: Record<string, unknown>, areaName = "local") {
      for (const listener of listeners) listener(changes, areaName);
    },
    reset() {
      listeners.clear();
      this.addListener.mockClear();
      this.removeListener.mockClear();
    },
  };
});

vi.mock("wxt/browser", () => ({
  browser: { runtime: { sendMessage }, storage: { onChanged: storageChanges } },
}));

const conversation = { kind: "identified", id: "conversation-a", siteId: "chatgpt" } as const;
const snapshot = { annotations: [], hasUnreadableAnnotations: false };

beforeEach(() => {
  sendMessage.mockReset();
  storageChanges.reset();
});

describe("browser draft store", () => {
  it("invalidates only the subscribed local draft and removes the listener on cleanup", () => {
    const changed = vi.fn();
    const stop = createBrowserDraftStore().subscribe(conversation, changed);
    storageChanges.emit({ "quotecue:draft:chatgpt:other": {} });
    storageChanges.emit({ "quotecue:draft:claude:conversation-a": {} });
    storageChanges.emit({ "quotecue:draft:chatgpt:conversation-a": {} }, "sync");
    expect(changed).not.toHaveBeenCalled();
    storageChanges.emit({ "quotecue:draft:chatgpt:conversation-a": { newValue: "untrusted" } });
    storageChanges.emit({ "quotecue:draft:chatgpt:conversation-a": { oldValue: "deleted" } });
    expect(changed.mock.calls).toEqual([[], []]);
    expect(sendMessage).not.toHaveBeenCalled();
    stop();
    storageChanges.emit({ "quotecue:draft:chatgpt:conversation-a": {} });
    expect(changed).toHaveBeenCalledTimes(2);
    expect(storageChanges.removeListener).toHaveBeenCalledWith(
      storageChanges.addListener.mock.calls[0]![0],
    );
  });

  it("loads the snapshot from a load response", async () => {
    sendMessage.mockResolvedValue({ kind: "loaded", draft: snapshot });

    await expect(createBrowserDraftStore().load(conversation)).resolves.toEqual(snapshot);
    expect(sendMessage).toHaveBeenCalledWith({
      channel: DRAFT_OWNER_MESSAGE,
      kind: "load",
      conversation,
    });
  });

  it("returns the authoritative result from a mutation response", async () => {
    const result = { ...snapshot, status: "ok" as const };
    sendMessage.mockResolvedValue({ kind: "mutated", result });

    await expect(
      createBrowserDraftStore().mutate(conversation, [{ kind: "clear" }]),
    ).resolves.toEqual(result);
    expect(sendMessage).toHaveBeenCalledWith({
      channel: DRAFT_OWNER_MESSAGE,
      kind: "mutate",
      conversation,
      mutations: [{ kind: "clear" }],
    });
  });

  it("rejects a valid response for a different operation", async () => {
    sendMessage.mockResolvedValue({
      kind: "mutated",
      result: { ...snapshot, status: "ok" },
    });

    await expect(createBrowserDraftStore().load(conversation)).rejects.toThrow(
      "Draft owner returned a response for the wrong operation",
    );
  });
});
