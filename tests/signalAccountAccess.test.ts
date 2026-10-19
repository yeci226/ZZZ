jest.mock("../src/utilities/accountStore.js", () => ({ getLegacyAccountAtIndex: jest.fn(), getLegacyAccounts: jest.fn() }));
jest.mock("../src/utilities/utilities.js", () => ({ getUserLang: async () => "tw", getUserZZZData: jest.fn() }));
jest.mock("../src/utilities/zzz/gachaPrivacy.js", () => ({ canViewPrivateGacha: jest.fn().mockResolvedValue(true) }));
jest.mock("../src/utilities/zzz/gachaArchive.js", () => ({ getGachaArchiveStore: () => ({ countRecords: mockCount }) }));
jest.mock("../src/utilities/zzz/signalLogView.js", () => ({ createSignalLogSession: jest.fn().mockResolvedValue({}), buildSignalLogMessage: jest.fn().mockResolvedValue({ content: "archive" }) }));
jest.mock("../src/utilities/zzz/rngMoeImportFlow.js", () => ({ beginRngMoeImport: jest.fn() }));
jest.mock("../src/utilities/zzz/manualGachaImportFlow.js", () => ({ beginManualGachaImport: jest.fn() }));
import signal from "../src/commands/slash/zzz/gacha.js";
import { getLegacyAccountAtIndex } from "../src/utilities/accountStore.js";
import { getUserZZZData } from "../src/utilities/utilities.js";
import { createSignalLogSession } from "../src/utilities/zzz/signalLogView.js";
import { canViewPrivateGacha } from "../src/utilities/zzz/gachaPrivacy.js";
const mockCount = jest.fn();
function interaction(): any { return { user: { id: "owner" }, options: { getSubcommand: () => "log", getUser: () => null, getString: () => "0" }, deferReply: jest.fn(), editReply: jest.fn() }; }
beforeEach(() => {
  jest.mocked(getLegacyAccountAtIndex).mockResolvedValue({ uid: "130000001", cookie: "expired", invalid: true });
  jest.mocked(getUserZZZData).mockResolvedValue(undefined);
  jest.mocked(canViewPrivateGacha).mockResolvedValue(true);
});
it("renders archived records without a live client when optional auth is unavailable", async () => {
  mockCount.mockReturnValue(3);
  const i = interaction();
  await signal.execute({} as any, i, [], jest.fn(), {} as any);
  expect(getUserZZZData).toHaveBeenCalledWith(i, expect.anything(), "owner", "tw", 0, { authMode: "optional" });
  expect(createSignalLogSession).toHaveBeenCalledWith(expect.objectContaining({ uid: "130000001", zzz: undefined, linked: true }));
  expect(i.editReply).toHaveBeenCalledWith({ content: "archive" });
});
it("stops after the required-auth notice when no archive is available", async () => {
  mockCount.mockReturnValue(0);
  const i = interaction();
  await signal.execute({} as any, i, [], jest.fn(), {} as any);
  expect(getUserZZZData).toHaveBeenCalledWith(i, expect.anything(), "owner", "tw", 0, { authMode: "required" });
  expect(createSignalLogSession).not.toHaveBeenCalled();
  expect(i.editReply).not.toHaveBeenCalled();
});
it("retains the privacy check before archive access", async () => {
  jest.mocked(canViewPrivateGacha).mockResolvedValue(false);
  await signal.execute({} as any, interaction(), [], jest.fn(), {} as any);
  expect(mockCount).not.toHaveBeenCalled();
  expect(getUserZZZData).not.toHaveBeenCalled();
});
