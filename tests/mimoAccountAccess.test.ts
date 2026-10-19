jest.mock("../src/utilities/accountStore.js", () => ({ getHoyolabs: jest.fn() }));
jest.mock("../src/utilities/accountAccess.js", () => ({ blockExpiredAccount: jest.fn().mockResolvedValue(true) }));
jest.mock("../src/utilities/settings/panel.js", () => ({ openSettingPanel: jest.fn() }));
jest.mock("../src/utilities/settings/presentation.js", () => ({ uiLocale: () => "tw", uiText: (_l: string, key: string) => key }));
jest.mock("../src/utilities/mimo/runtime.js", () => ({ getMimoStore: () => mockStore, mimoAccount: jest.fn() }));
jest.mock("../src/utilities/mimo/api.js", () => ({ MimoApi: jest.fn() }));
jest.mock("../src/utilities/canvas/redeemCard.js", () => ({ buildZZZRedeemCards: jest.fn() }));
import { openMimoSettings } from "../src/utilities/mimo/panel.js";
import { getHoyolabs } from "../src/utilities/accountStore.js";
import { blockExpiredAccount } from "../src/utilities/accountAccess.js";
import { openSettingPanel } from "../src/utilities/settings/panel.js";
import { MimoApi } from "../src/utilities/mimo/api.js";
const mockStore = { get: jest.fn(), save: jest.fn((c: any) => c) };
async function panel() {
  jest.mocked(getHoyolabs).mockResolvedValue([
    { ltuid_v2: "foreign", cookie: "cookie", characters: [{ uid: "1" }] },
    { ltuid_v2: "mine", cookie: "expired", invalid: true, characters: [{ uid: "2" }] },
  ] as any);
  mockStore.get.mockImplementation((id: string) => id === "foreign" ? { owner: "someone-else" } : undefined);
  await openMimoSettings({} as any, { user: { id: "owner" }, deferred: true } as any, { get: async () => "tw" });
  const callbacks = jest.mocked(openSettingPanel).mock.calls[0][1] as any;
  return { s: { ...callbacks }, action: callbacks.action };
}
it("checks the actual account index before fetching rewards and preserves the current page", async () => {
  const { s, action } = await panel();
  await action(s, "edit-rewards", {});
  expect(blockExpiredAccount).toHaveBeenCalledWith({}, expect.anything(), expect.objectContaining({ accountIndex: 1 }));
  expect(MimoApi).not.toHaveBeenCalled();
  expect(s.page).toBe("home");
});
it("allows cached reward editing without authentication", async () => {
  const { s, action } = await panel();
  s.data.catalogAt = Date.now(); s.data.catalogAccount = "mine";
  await action(s, "edit-rewards", {});
  expect(s.page).toBe("rewards");
  expect(blockExpiredAccount).not.toHaveBeenCalled();
  expect(MimoApi).not.toHaveBeenCalled();
});
it("allows invalid accounts to save local notification settings", async () => {
  const { s, action } = await panel();
  await action(s, "edit-notification", {});
  s.draft.notifyType = "off";
  await action(s, "save", {});
  expect(mockStore.save).toHaveBeenCalled();
  expect(blockExpiredAccount).not.toHaveBeenCalled();
  expect(MimoApi).not.toHaveBeenCalled();
});
