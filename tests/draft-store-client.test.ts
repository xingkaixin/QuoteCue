import { beforeEach, describe, expect, it, vi } from "vitest";

import { DRAFT_OWNER_MESSAGE } from "@/features/annotations/draft-owner-protocol";
import { createBrowserDraftStore } from "@/features/annotations/draft-store-client";

const sendMessage = vi.hoisted(() => vi.fn());

vi.mock("wxt/browser", () => ({
  browser: { runtime: { sendMessage } },
}));

const conversation = { kind: "identified", id: "conversation-a", siteId: "chatgpt" } as const;
const snapshot = { annotations: [], hasUnreadableAnnotations: false };

beforeEach(() => sendMessage.mockReset());

describe("browser draft store", () => {
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
