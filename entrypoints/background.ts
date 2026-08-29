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

    const result =
      message.kind === "load"
        ? owner
            .load(message.conversation)
            .then((draft) => ({ kind: "loaded", draft }) satisfies DraftOwnerResponse)
        : owner
            .mutate(message.conversation, message.mutations)
            .then((value) => ({ kind: "mutated", result: value }) satisfies DraftOwnerResponse);

    void result.then(
      (value) => sendResponse(value satisfies DraftOwnerResponse),
      (error: unknown) => {
        console.error("[QuoteCue] Draft owner failed", error);
        sendResponse({
          kind: "error",
          message: "Draft storage is unavailable",
        } satisfies DraftOwnerResponse);
      },
    );
    return true;
  });
});
