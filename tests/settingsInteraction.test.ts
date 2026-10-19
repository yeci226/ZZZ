import { ButtonInteraction, Client, Events } from "discord.js";

const mockClient = new Client({ intents: [] });
const mockError = jest.fn();
jest.mock("../src/index.js", () => ({ client: mockClient }));
jest.mock("../src/utilities/core/logger.js", () => ({
  __esModule: true,
  default: class { info() {} error(message: string) { mockError(message); } },
}));
import { __settingSessions, openSettingPanel } from "../src/utilities/settings/panel.js";
import "../src/events/settingsInteraction.js";

const render = async () => ({ components: [] });
async function createButton(action = jest.fn(async () => {})) {
  await openSettingPanel({ user: { id: "123456789012345678" }, deferred: true, editReply: jest.fn() } as any, {
    locale: "tw", page: "home", base: {}, draft: {}, data: {}, render, action,
  });
  const session = [...__settingSessions.values()][0];
  const interaction: ButtonInteraction = new (ButtonInteraction as any)(mockClient, {
    id: "1500000000000000000", application_id: "123456789012345679", type: 3,
    token: "test-only", version: 1, locale: "zh-TW", entitlements: [], authorizing_integration_owners: {},
    user: { id: session.owner, username: "tester", discriminator: "0", avatar: null },
    data: { component_type: 2, custom_id: `settingui:${session.token}:open-daily` },
    message: { id: "1500000000000000001", channel_id: "1500000000000000002", content: "", author: { id: "123456789012345679", username: "bot", discriminator: "0", avatar: null }, components: [] },
  });
  jest.spyOn(interaction.webhook, "editMessage").mockResolvedValue({} as any);
  jest.spyOn(interaction, "followUp").mockResolvedValue({} as any);
  return { interaction, session, action };
}
const dispatch = async (interaction: ButtonInteraction) => {
  for (const listener of mockClient.listeners(Events.InteractionCreate)) await listener(interaction);
};
beforeEach(() => {
  __settingSessions.clear();
  jest.clearAllMocks();
  jest.spyOn(mockClient.rest, "post").mockResolvedValue({});
});
afterEach(() => jest.restoreAllMocks());

test("the registered router acknowledges a real Discord button and executes its action", async () => {
  const { interaction, action } = await createButton();
  await dispatch(interaction);
  expect(mockClient.rest.post).toHaveBeenCalledTimes(1);
  expect(mockClient.rest.post).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ body: { type: 6 } }));
  expect(action).toHaveBeenCalledWith(expect.anything(), "open-daily", interaction);
  expect(interaction.webhook.editMessage).toHaveBeenCalledTimes(1);
  expect(mockError).not.toHaveBeenCalled();
});

test("an already acknowledged button still executes instead of throwing InteractionAlreadyReplied", async () => {
  const { interaction, action } = await createButton();
  interaction.deferred = true;
  await dispatch(interaction);
  expect(mockClient.rest.post).not.toHaveBeenCalled();
  expect(action).toHaveBeenCalledTimes(1);
  expect(mockError).not.toHaveBeenCalled();
});

test("an action failure is logged and shown even when the parent renderer has no notice", async () => {
  const { interaction } = await createButton(jest.fn(async () => { throw new Error("render failed"); }));
  await dispatch(interaction);
  expect(mockError).toHaveBeenCalledWith(expect.stringContaining("render failed"));
  expect(interaction.followUp).toHaveBeenCalledWith(expect.objectContaining({ flags: 64, content: expect.any(String) }));
});

test("Discord acknowledgment failures reach the event logger", async () => {
  const { interaction, action } = await createButton();
  jest.mocked(mockClient.rest.post).mockRejectedValueOnce(Object.assign(new Error("Unknown interaction"), { code: 10062 }));
  await dispatch(interaction);
  expect(action).not.toHaveBeenCalled();
  expect(mockError).toHaveBeenCalledWith(expect.stringContaining("10062"));
});
