import { createDraftOwner } from "@/features/annotations/draft-owner";
import {
  isDraftOwnerRequest,
  type DraftOwnerResponse,
} from "@/features/annotations/draft-owner-protocol";

export default defineBackground(() => {
  const owner = createDraftOwner();

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isDraftOwnerRequest(message)) {
      return false;
    }

    const annotations =
      message.kind === "load"
        ? owner.load(message.conversation)
        : owner.mutate(message.conversation, message.mutation);

    void annotations.then(
      (value) => sendResponse({ status: "ok", annotations: value } satisfies DraftOwnerResponse),
      (error: unknown) => {
        console.error("[QuoteCue] Draft owner failed", error);
        sendResponse({
          status: "error",
          message: "Draft storage is unavailable",
        } satisfies DraftOwnerResponse);
      },
    );
    return true;
  });
});
