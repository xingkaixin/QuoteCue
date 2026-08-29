import { browser } from "wxt/browser";

import {
  DRAFT_OWNER_MESSAGE,
  isDraftOwnerResponse,
  type DraftOwnerRequest,
  type DraftOwnerResponse,
} from "./draft-owner-protocol";
import type { DraftStore } from "./draft-store";

type DraftOwnerSuccessResponse = Exclude<DraftOwnerResponse, { kind: "error" }>;

export function createBrowserDraftStore(): DraftStore {
  return {
    load: async (conversation) => {
      const response = await request({
        channel: DRAFT_OWNER_MESSAGE,
        kind: "load",
        conversation,
      });
      if (response.kind !== "loaded") {
        throw new Error("Draft owner returned a response for the wrong operation");
      }
      return response.draft;
    },
    mutate: async (conversation, mutations) => {
      const response = await request({
        channel: DRAFT_OWNER_MESSAGE,
        kind: "mutate",
        conversation,
        mutations,
      });
      if (response.kind !== "mutated") {
        throw new Error("Draft owner returned a response for the wrong operation");
      }
      return response.result;
    },
  };
}

async function request(message: DraftOwnerRequest): Promise<DraftOwnerSuccessResponse> {
  const response: unknown = await browser.runtime.sendMessage(message);
  if (!isDraftOwnerResponse(response)) {
    throw new Error("Draft owner returned an unexpected response");
  }
  if (response.kind === "error") {
    throw new Error(response.message);
  }
  return response;
}
