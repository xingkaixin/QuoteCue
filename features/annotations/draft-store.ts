import type { IdentifiedConversation } from "@/features/host-port/host-port";

import type { DraftAnnotation } from "./annotation";

export type DraftStore = {
  load(conversation: IdentifiedConversation): Promise<DraftAnnotation[]>;
  save(conversation: IdentifiedConversation, annotations: DraftAnnotation[]): Promise<void>;
};
