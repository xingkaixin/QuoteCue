import type { IdentifiedConversation } from "@/features/conversation/conversation-identity";

import type { DraftAnnotation } from "./annotation";
import type { DraftMutation } from "./draft-mutation";

export type DraftStore = {
  load(conversation: IdentifiedConversation): Promise<DraftAnnotation[]>;
  /** Applies ordered domain mutations and resolves with the authoritative annotations afterwards. */
  mutate(
    conversation: IdentifiedConversation,
    mutations: readonly DraftMutation[],
  ): Promise<DraftAnnotation[]>;
};
