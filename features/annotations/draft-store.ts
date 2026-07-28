import type { IdentifiedConversation } from "@/features/host-port/host-port";

import type { DraftAnnotation } from "./annotation";
import type { DraftMutation } from "./draft-mutation";

export type DraftStore = {
  load(conversation: IdentifiedConversation): Promise<DraftAnnotation[]>;
  /** Applies one domain mutation and resolves with the authoritative annotations afterwards. */
  mutate(conversation: IdentifiedConversation, mutation: DraftMutation): Promise<DraftAnnotation[]>;
};
