import { EventEmitter } from "node:events";
import { Events } from "discord.js";

const mockClient = new EventEmitter();
const mockGetUserLang = jest.fn(async () => "tw");
const mockHandleButton = jest.fn(async (interaction: any) => { await interaction.deferUpdate(); });
jest.mock("../src/index.js", () => ({ client: mockClient }));
jest.mock("../src/utilities/utilities.js", () => ({ getUserLang: (...args: any[]) => mockGetUserLang() }));
jest.mock("../src/utilities/zzz/gachaSimulationInteraction.js", () => ({
  handleGachaSimulationButton: (interaction: any) => mockHandleButton(interaction),
}));
jest.mock("../src/utilities/zzz/gachaSimulationRecovery.js", () => ({ startSimulationRecovery: jest.fn() }));
jest.mock("../src/utilities/news/wizard.js", () => ({ isNewsInteraction: (id: string) => id.startsWith("news:") }));
jest.mock("../src/utilities/zzz/profile.js", () => ({}));
jest.mock("../src/utilities/zzz/profileMainData.js", () => ({}));
jest.mock("../src/utilities/zzz/team.js", () => ({}));
jest.mock("../src/utilities/zzz/deadly.js", () => ({}));
jest.mock("../src/utilities/accountStore.js", () => ({}));
jest.mock("queue", () => ({ __esModule: true, default: class {} }));

import "../src/events/selectMenu.js";
import "../src/events/gachaSimulationInteraction.js";

it.each(["one", "ten", "skip"])("routes %s to the simulation handler without the generic button handler acknowledging it", async action => {
  const interaction: any = {
    customId: `gsim:${action}:${"a".repeat(24)}`, user: { id: "owner" }, locale: "zh-TW",
    isButton: () => true, isStringSelectMenu: () => false,
    deferUpdate: jest.fn().mockResolvedValue(undefined),
  };
  // Match EventEmitter's concurrent listeners, including the legacy handler.
  await Promise.all(mockClient.listeners(Events.InteractionCreate).map(listener => listener(interaction)));
  expect(mockHandleButton).toHaveBeenCalledTimes(1);
  expect(mockHandleButton).toHaveBeenCalledWith(interaction);
  expect(interaction.deferUpdate).toHaveBeenCalledTimes(1);
  expect(mockGetUserLang).not.toHaveBeenCalled();
});
