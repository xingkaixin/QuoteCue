import type { IdentifiedConversation } from "@/features/conversation/conversation-identity";

import type { DraftAnnotation } from "./annotation";
import type { DraftMutation } from "./draft-mutation";

export type DraftSnapshot = {
  annotations: DraftAnnotation[];
  hasUnreadableAnnotations: boolean;
};

export type DraftRejectionReason = "capacity" | "unreadable";

export type DraftMutationResult = DraftSnapshot &
  ({ status: "ok" } | { status: "rejected"; reason: DraftRejectionReason });

export type DraftStore = {
  load(conversation: IdentifiedConversation): Promise<DraftSnapshot>;
  /** Applies ordered domain mutations and resolves with the authoritative annotations afterwards. */
  mutate(
    conversation: IdentifiedConversation,
    mutations: readonly DraftMutation[],
  ): Promise<DraftMutationResult>;
};
