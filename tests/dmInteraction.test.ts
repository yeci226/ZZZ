import { EventEmitter } from "node:events";
import { ChannelType, Events } from "discord.js";

const mockClient = new EventEmitter() as any;
const mockExecute = jest.fn(async () => undefined);
const mockSlashGet = jest.fn((..._args: any[]) => ({
  data: { name: "profile" },
  execute: mockExecute,
}));
const mockGetUserLang = jest.fn(async (..._args: any[]) => "en");
const mockDrainPendingLogins = jest.fn(async (..._args: any[]) => undefined);
(mockClient as any).commands = {
  slash: { get: () => mockSlashGet() },
};
(mockClient as any).db = {};
jest.mock("../src/index.js", () => ({
  client: mockClient,
  commands: { slash: { get: () => mockSlashGet() } },
  db: {},
}));
jest.mock("../src/utilities/utilities.js", () => ({
  setupDefaultLang: jest.fn(async () => undefined),
  getUserLang: () => mockGetUserLang(),
}));
jest.mock("../src/utilities/core/i18n.js", () => ({
  createTranslator: () => (key: string) => key,
  toI18nLang: () => "en",
}));
jest.mock("../src/utilities/core/interactionLocale.js", () => ({
  resolveInteractionLocale: async ({ fallbackLocale }: any) => fallbackLocale,
}));
jest.mock("../src/utilities/core/config.js", () => ({
  getConfig: () => ({ CMDWEBHOOK: undefined }),
}));
jest.mock("../src/utilities/webhookLogin.js", () => ({
  drainPendingLogins: (userId: string) => mockDrainPendingLogins(userId),
}));
jest.mock("../src/utilities/core/logger.js", () => ({
  __esModule: true,
  default: class {
    command() {}
    error() {}
  },
}));
jest.mock("../src/utilities/shared/index.js", () => ({
  getCommandAckPlan: () => ({ shouldDefer: false, ephemeral: true }),
  ensureDeferredReply: jest.fn(async () => undefined),
  replyOrFollowUp: jest.fn(async () => undefined),
  TtlCache: class {
    async getOrSetAsync(_key: string, loader: () => Promise<string>) {
      return loader();
    }
    set() {}
  },
  fireAndForget: jest.fn(),
}));
jest.mock("../src/utilities/shared/interactionPreflight.js", () => ({
  getInteractionPreflight: () => ({
    deferBeforeDrain: false,
    skipPendingLoginDrain: false,
    skipLocaleLookup: false,
  }),
}));

import "../src/events/interactionCreate";

describe("ZZZ DM interaction routing", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("executes a slash command received through a DM", async () => {
    const interaction: any = {
      channel: { type: ChannelType.DM },
      user: {
        id: "user-1",
        username: "tester",
        displayName: "tester",
        displayAvatarURL: () => "",
      },
      locale: "en-US",
      commandName: "profile",
      createdTimestamp: Date.now(),
      options: { data: [] },
      isCommand: () => true,
      isChatInputCommand: () => true,
      isButton: () => false,
      isContextMenuCommand: () => false,
      deferred: false,
      replied: false,
    };

    mockClient.emit(Events.InteractionCreate, interaction);
    await new Promise((resolve) => setImmediate(resolve));

    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(mockDrainPendingLogins).toHaveBeenCalledWith("user-1");
  });
});
