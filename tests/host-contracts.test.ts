import { createChatGptHost } from "@/features/chatgpt/chatgpt-host";
import { createClaudeHost } from "@/features/claude/claude-host";
import { createDeepSeekHost } from "@/features/deepseek/deepseek-host";
import { createKimiHost } from "@/features/kimi/kimi-host";

import {
  appendAssistantMessage,
  appendUserMessage,
  installChatGptHostFixture,
} from "./fixtures/chatgpt-host";
import {
  appendClaudeAssistantMessage,
  appendClaudeUserMessage,
  installClaudeHostFixture,
  replaceVoiceWithSend,
} from "./fixtures/claude-host";
import {
  appendAssistantMessageItem,
  appendUserMessageItem,
  installDeepSeekHostFixture,
} from "./fixtures/deepseek-host";
import { requiredElement } from "./fixtures/fixture-utils";
import {
  appendKimiAssistantMessage,
  appendKimiUserMessage,
  installKimiHostFixture,
} from "./fixtures/kimi-host";
import { runHostContractSuite, type HostContractDefinition } from "./host-contract-suite";

const contracts: HostContractDefinition[] = [
  {
    name: "ChatGPT",
    createHost: createChatGptHost,
    installFixture() {
      const fixture = installChatGptHostFixture();
      return {
        assistantMessage: fixture.assistantMessage,
        composer: fixture.composer,
        sendControl: fixture.action,
        surface: fixture.surface,
        userMessage: fixture.userMessage,
      };
    },
    appendAssistantMessage: (text) => appendAssistantMessage("assistant-contract", text),
    appendUserMessage: (text) => {
      appendUserMessage("user-contract", text);
    },
    conversation: {
      id: "conversation-contract",
      matchedPath: "/c/conversation-contract",
      unmatchedPath: "/",
    },
    expectedMessageId: "assistant-one",
    invalidateCapturedIdentity(fixture) {
      fixture.assistantMessage.remove();
      appendAssistantMessage("assistant-one", "Changed assistant answer");
    },
    selectionActionMode: "native-toolbar",
    setSendDisabled(control, isDisabled) {
      (control as HTMLButtonElement).disabled = isDisabled;
    },
  },
  {
    name: "Claude",
    createHost: createClaudeHost,
    installFixture() {
      const fixture = installClaudeHostFixture();
      const sendControl = replaceVoiceWithSend(() => undefined);
      return {
        assistantMessage: fixture.assistantMessage,
        composer: fixture.composer,
        sendControl,
        surface: fixture.surface,
        userMessage: fixture.userMessage,
      };
    },
    appendAssistantMessage: (text) => appendClaudeAssistantMessage(2, text),
    appendUserMessage: (text) => {
      appendClaudeUserMessage(3, text);
    },
    conversation: {
      id: "conversation-contract",
      matchedPath: "/chat/conversation-contract",
      unmatchedPath: "/new",
    },
    expectedMessageId: "1",
    invalidateCapturedIdentity(fixture) {
      const wrapper = fixture.assistantMessage.closest<HTMLElement>("[data-rs-index]");
      if (!wrapper) {
        throw new Error("Expected Claude message index");
      }
      wrapper.dataset.rsIndex = "2";
      appendClaudeAssistantMessage(1, "Changed assistant answer");
    },
    selectionActionMode: "native-toolbar",
    setSendDisabled(control, isDisabled) {
      (control as HTMLButtonElement).disabled = isDisabled;
    },
  },
  {
    name: "DeepSeek",
    createHost: createDeepSeekHost,
    installFixture() {
      const fixture = installDeepSeekHostFixture();
      return {
        assistantMessage: fixture.assistantContent,
        composer: fixture.composer,
        sendControl: fixture.sendButton,
        surface: fixture.surface,
        userMessage: fixture.userMessage,
      };
    },
    appendAssistantMessage(text) {
      const item = appendAssistantMessageItem("assistant-contract", text);
      return requiredElement<HTMLElement>(".ds-assistant-message-main-content", item);
    },
    appendUserMessage: (text) => {
      appendUserMessageItem("user-contract", text);
    },
    conversation: {
      id: "conversation-contract",
      matchedPath: "/a/chat/s/conversation-contract",
      unmatchedPath: "/",
    },
    expectedMessageId: "assistant-one",
    invalidateCapturedIdentity(fixture) {
      fixture.assistantMessage.remove();
      appendAssistantMessageItem("assistant-one", "Changed assistant answer");
    },
    selectionActionMode: "overlay",
    setSendDisabled(control, isDisabled) {
      control.classList.toggle("ds-button--disabled", isDisabled);
    },
  },
  {
    name: "Kimi",
    createHost: createKimiHost,
    installFixture() {
      const fixture = installKimiHostFixture();
      return {
        assistantMessage: fixture.assistantMessage,
        composer: fixture.composer,
        sendControl: fixture.sendControl,
        surface: fixture.surface,
        userMessage: fixture.userMessage,
      };
    },
    appendAssistantMessage: (text) => appendKimiAssistantMessage("assistant-contract", text),
    appendUserMessage: (text) => {
      appendKimiUserMessage("user-contract", text);
    },
    conversation: {
      id: "conversation-contract",
      matchedPath: "/chat/conversation-contract",
      unmatchedPath: "/settings",
    },
    expectedMessageId: "assistant-one",
    invalidateCapturedIdentity(fixture) {
      fixture.assistantMessage.remove();
      appendKimiAssistantMessage("assistant-one", "Changed assistant answer");
    },
    selectionActionMode: "overlay",
    setSendDisabled(control, isDisabled) {
      control.classList.toggle("disabled", isDisabled);
    },
  },
];

for (const contract of contracts) {
  runHostContractSuite(contract);
}
