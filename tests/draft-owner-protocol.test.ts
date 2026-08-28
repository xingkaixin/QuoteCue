import { describe, expect, it } from "vitest";

import {
  DRAFT_OWNER_MESSAGE,
  isDraftOwnerRequest,
  isDraftOwnerResponse,
} from "@/features/annotations/draft-owner-protocol";

const conversation = { kind: "identified", id: "conversation-a", siteId: "chatgpt" } as const;
const annotation = {
  id: "annotation-a",
  anchor: {
    end: 13,
    format: "exact",
    messageId: "message-a",
    prefix: "before",
    quote: "selected text",
    start: 0,
    suffix: "after",
  },
  comment: "Explain this",
} as const;

describe("draft owner protocol", () => {
  it("accepts a complete load request", () => {
    expect(isDraftOwnerRequest({ channel: DRAFT_OWNER_MESSAGE, kind: "load", conversation })).toBe(
      true,
    );
  });

  it.each([
    { kind: "add", annotation },
    { kind: "update", annotationId: annotation.id, comment: "Updated" },
    { kind: "discard", annotationIds: [annotation.id] },
    { kind: "discard-confirmed", annotations: [annotation] },
    { kind: "clear" },
  ])("accepts a complete $kind mutation", (mutation) => {
    expect(
      isDraftOwnerRequest({
        channel: DRAFT_OWNER_MESSAGE,
        kind: "mutate",
        conversation,
        mutations: [mutation],
      }),
    ).toBe(true);
  });

  it.each([
    null,
    { channel: DRAFT_OWNER_MESSAGE },
    { channel: DRAFT_OWNER_MESSAGE, kind: "load" },
    {
      channel: DRAFT_OWNER_MESSAGE,
      kind: "load",
      conversation: { kind: "unidentified", sessionKey: "session-a" },
    },
    {
      channel: DRAFT_OWNER_MESSAGE,
      kind: "load",
      conversation: { kind: "identified", id: "conversation-a" },
    },
    {
      channel: DRAFT_OWNER_MESSAGE,
      kind: "load",
      conversation: { kind: "identified", id: "conversation-a", siteId: "unknown" },
    },
    {
      channel: DRAFT_OWNER_MESSAGE,
      kind: "mutate",
      conversation,
      mutations: [{ kind: "update", annotationId: "annotation-a", comment: 42 }],
    },
    {
      channel: DRAFT_OWNER_MESSAGE,
      kind: "mutate",
      conversation,
      mutations: [{ kind: "add", annotation: { ...annotation, anchor: null } }],
    },
    { channel: DRAFT_OWNER_MESSAGE, kind: "mutate", conversation, mutations: [] },
  ])("rejects an incomplete request: %#", (request) => {
    expect(isDraftOwnerRequest(request)).toBe(false);
  });

  it("accepts complete success and error responses", () => {
    expect(
      isDraftOwnerResponse({
        status: "ok",
        annotations: [annotation],
        hasUnreadableAnnotations: false,
      }),
    ).toBe(true);
    expect(isDraftOwnerResponse({ status: "error", message: "storage unavailable" })).toBe(true);
  });

  it.each(["capacity", "unreadable"])(
    "accepts a %s rejection with authoritative data",
    (reason) => {
      expect(
        isDraftOwnerResponse({
          status: "rejected",
          reason,
          annotations: [annotation],
          hasUnreadableAnnotations: true,
        }),
      ).toBe(true);
    },
  );

  it.each([
    { status: "rejected", reason: "unknown", annotations: [], hasUnreadableAnnotations: false },
    { status: "rejected", annotations: [], hasUnreadableAnnotations: false },
    { status: "ok", annotations: [], hasUnreadableAnnotations: "false" },
    undefined,
    { status: "ok" },
    { status: "ok", annotations: null },
    { status: "ok", annotations: [{ ...annotation, comment: 42 }] },
    { status: "error" },
    { status: "error", message: 42 },
  ])("rejects an incomplete response: %#", (response) => {
    expect(isDraftOwnerResponse(response)).toBe(false);
  });
});
