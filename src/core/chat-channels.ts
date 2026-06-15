import type { ApprovalPackage, ChatChannel, HumanDecisionResult, ThreadRef } from "./contracts.js";
import { requireOperatorConfig, type SaveOperatorConfigInput } from "./operator-config.js";
import { defaultSimulatorChatChannel } from "./simulator-adapters.js";

export class SlackChatChannel implements ChatChannel {
  readonly id = "slack";

  constructor(private readonly slackChannel: string) {}

  async postApproval(_pkg: ApprovalPackage): Promise<ThreadRef> {
    return { id: this.slackChannel };
  }

  async awaitDecision(_ref: ThreadRef, _timeoutMs: number): Promise<HumanDecisionResult> {
    return {
      action: "hold",
      actor: "slack-channel"
    };
  }

  async notify(_ref: ThreadRef, _update: string): Promise<void> {}
}

export function createChatChannelFromConfig(config: SaveOperatorConfigInput): ChatChannel {
  if (config.slackChannel.trim()) {
    return new SlackChatChannel(config.slackChannel.trim());
  }
  return defaultSimulatorChatChannel;
}

export function getConfiguredChatChannel(): ChatChannel {
  return createChatChannelFromConfig(requireOperatorConfig());
}
