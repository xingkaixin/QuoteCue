import { browser } from "wxt/browser";

import type { DraftAnnotation } from "./annotation";
import {
  DRAFT_OWNER_MESSAGE,
  isDraftOwnerResponse,
  type DraftOwnerRequest,
} from "./draft-owner-protocol";
import type { DraftStore } from "./draft-store";

export function createBrowserDraftStore(): DraftStore {
  return {
    load: (conversation) => request({ channel: DRAFT_OWNER_MESSAGE, kind: "load", conversation }),
    mutate: (conversation, mutation) =>
      request({ channel: DRAFT_OWNER_MESSAGE, kind: "mutate", conversation, mutation }),
  };
}

async function request(message: DraftOwnerRequest): Promise<DraftAnnotation[]> {
  const response: unknown = await browser.runtime.sendMessage(message);
  if (!isDraftOwnerResponse(response)) {
    throw new Error("Draft owner returned an unexpected response");
  }
  if (response.status === "error") {
    throw new Error(response.message);
  }
  return response.annotations;
}
