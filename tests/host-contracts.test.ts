import { createChatGptHost } from "@/features/chatgpt/chatgpt-host";
import { createClaudeHost } from "@/features/claude/claude-host";
import { createDeepSeekHost } from "@/features/deepseek/deepseek-host";
import { createKimiHost } from "@/features/kimi/kimi-host";

import {
  appendAssistantMessage,
  appendSelectionToolbar,
  appendUserMessage,
  installChatGptHostFixture,
  setChatGptStreaming,
} from "./fixtures/chatgpt-host";
import {
  appendClaudeAssistantMessage,
  appendClaudeSelectionToolbar,
  appendClaudeUserMessage,
  enableClaudeSend,
  installClaudeHostFixture,
  setClaudeStreaming,
} from "./fixtures/claude-host";
import {
  appendAssistantMessageItem,
  appendUserMessageItem,
  installDeepSeekHostFixture,
  setDeepSeekStreaming,
} from "./fixtures/deepseek-host";
import { requiredElement } from "./fixtures/fixture-utils";
import {
  appendKimiAssistantMessage,
  appendKimiUserMessage,
  installKimiHostFixture,
  setKimiStreaming,
} from "./fixtures/kimi-host";
import { runHostContractSuite, type HostContractDefinition } from "./host-contract-suite";

const contracts: HostContractDefinition[] = [
  {
    name: "ChatGPT",
    setStreaming: setChatGptStreaming,
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
    appendUserMessage: (text) => appendUserMessage("user-contract", text),
    conversation: {
      additionalMatchedPaths: ["/g/gizmo-contract/c/conversation-contract"],
      id: "conversation-contract",
      matchedPath: "/c/conversation-contract",
      unmatchedPath: "/",
    },
    expectedMessageId: "assistant-one",
    installSelectionToolbar: appendSelectionToolbar,
    removeMessageIdentity(fixture) {
      fixture.assistantMessage.removeAttribute("data-message-id");
    },
    selectionPresentation: "native-toolbar",
    siteId: "chatgpt",
    setSendDisabled(control, isDisabled) {
      (control as HTMLButtonElement).disabled = isDisabled;
    },
    supportsSyntheticPaste: true,
  },
  {
    name: "Claude",
    setStreaming: setClaudeStreaming,
    createHost: createClaudeHost,
    installFixture() {
      const fixture = installClaudeHostFixture();
      const sendControl = enableClaudeSend(() => undefined);
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
      const message = appendClaudeUserMessage(3, text);
      return requiredElement<HTMLElement>("[data-testid='user-message']", message);
    },
    conversation: {
      id: "conversation-contract",
      matchedPath: "/chat/conversation-contract",
      unmatchedPath: "/new",
    },
    expectedMessageId: "1",
    installSelectionToolbar: appendClaudeSelectionToolbar,
    removeMessageIdentity(fixture) {
      fixture.assistantMessage
        .closest<HTMLElement>("[data-rs-index]")
        ?.removeAttribute("data-rs-index");
    },
    selectionPresentation: "native-toolbar",
    siteId: "claude",
    setSendDisabled(control, isDisabled) {
      (control as HTMLButtonElement).disabled = isDisabled;
    },
    supportsSyntheticPaste: true,
  },
  {
    name: "DeepSeek",
    setStreaming: setDeepSeekStreaming,
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
      const item = appendUserMessageItem("user-contract", text);
      return requiredElement<HTMLElement>(".d29f3d7d", item);
    },
    conversation: {
      id: "conversation-contract",
      matchedPath: "/a/chat/s/conversation-contract",
      unmatchedPath: "/",
    },
    expectedMessageId: "assistant-one",
    removeMessageIdentity(fixture) {
      fixture.assistantMessage
        .closest<HTMLElement>("[data-virtual-list-item-key]")
        ?.removeAttribute("data-virtual-list-item-key");
    },
    selectionPresentation: "overlay",
    siteId: "deepseek",
    setSendDisabled(control, isDisabled) {
      control.classList.toggle("ds-button--disabled", isDisabled);
    },
    supportsSyntheticPaste: false,
  },
  {
    name: "Kimi",
    setStreaming: setKimiStreaming,
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
      const message = appendKimiUserMessage("user-contract", text);
      return requiredElement<HTMLElement>(".user-content", message);
    },
    conversation: {
      id: "conversation-contract",
      matchedPath: "/chat/conversation-contract",
      unmatchedPath: "/settings",
    },
    expectedMessageId: "assistant-one",
    removeMessageIdentity(fixture) {
      fixture.assistantMessage.removeAttribute("data-archer-id");
    },
    selectionPresentation: "overlay",
    siteId: "kimi",
    setSendDisabled(control, isDisabled) {
      control.classList.toggle("disabled", isDisabled);
    },
    supportsSyntheticPaste: true,
  },
];

for (const contract of contracts) {
  runHostContractSuite(contract);
}
