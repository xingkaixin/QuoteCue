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

  it("accepts a complete load response", () => {
    expect(
      isDraftOwnerResponse({
        kind: "loaded",
        draft: {
          annotations: [annotation],
          hasUnreadableAnnotations: false,
        },
      }),
    ).toBe(true);
  });

  it("accepts complete mutation and error responses", () => {
    expect(
      isDraftOwnerResponse({
        kind: "mutated",
        result: {
          status: "ok",
          annotations: [annotation],
          hasUnreadableAnnotations: false,
        },
      }),
    ).toBe(true);
    expect(isDraftOwnerResponse({ kind: "error", message: "storage unavailable" })).toBe(true);
  });

  it.each(["capacity", "unreadable"])(
    "accepts a %s rejection with authoritative data",
    (reason) => {
      expect(
        isDraftOwnerResponse({
          kind: "mutated",
          result: {
            status: "rejected",
            reason,
            annotations: [annotation],
            hasUnreadableAnnotations: true,
          },
        }),
      ).toBe(true);
    },
  );

  it.each([
    {
      kind: "mutated",
      result: {
        status: "rejected",
        reason: "unknown",
        annotations: [],
        hasUnreadableAnnotations: false,
      },
    },
    {
      kind: "mutated",
      result: { status: "rejected", annotations: [], hasUnreadableAnnotations: false },
    },
    {
      kind: "mutated",
      result: { status: "ok", annotations: [], hasUnreadableAnnotations: "false" },
    },
    undefined,
    { kind: "loaded" },
    { kind: "loaded", draft: { annotations: null, hasUnreadableAnnotations: false } },
    {
      kind: "loaded",
      draft: {
        annotations: [{ ...annotation, comment: 42 }],
        hasUnreadableAnnotations: false,
      },
    },
    { kind: "error" },
    { kind: "error", message: 42 },
    { status: "ok", annotations: [], hasUnreadableAnnotations: false },
  ])("rejects an incomplete response: %#", (response) => {
    expect(isDraftOwnerResponse(response)).toBe(false);
  });
});
