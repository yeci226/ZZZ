import { applyGachaArchiveBinding } from "../src/utilities/accountStore.js";
import { listGloballyEnabledOwners, reconcileWeeklyArchiveAccounts } from "../src/utilities/zzz/gachaArchiveMaintenance.js";

describe("future gacha archive enrollment", () => {
  it("creates and enables an official archive for a newly bound account", () => {
    const archive = {
      markOrphaned: jest.fn(() => 0),
      restoreLinked: jest.fn(() => 0),
      upsertAccount: jest.fn(),
      setWeeklyEnabled: jest.fn(),
    };
    applyGachaArchiveBinding("restore", "owner", "130000001", "prod_gf_jp", true, archive);
    expect(archive.upsertAccount).toHaveBeenCalledWith({
      ownerId: "owner",
      uid: "130000001",
      region: "prod_gf_jp",
      source: "official",
      everLinked: true,
    });
    expect(archive.setWeeklyEnabled).toHaveBeenCalledWith("owner", "130000001", true);
  });

  it("does not create a future archive when the global switch is off", () => {
    const archive = {
      markOrphaned: jest.fn(() => 0),
      restoreLinked: jest.fn(() => 0),
      upsertAccount: jest.fn(),
      setWeeklyEnabled: jest.fn(),
    };
    applyGachaArchiveBinding("restore", "owner", "130000001", "", false, archive);
    expect(archive.restoreLinked).toHaveBeenCalled();
    expect(archive.upsertAccount).not.toHaveBeenCalled();
  });

  it("discovers global weekly owners even before they have an archive row", async () => {
    const db = { all: jest.fn(async () => [
      { id: "enabled", value: { gachaWeeklyArchive: true } },
      { id: "disabled", value: { gachaWeeklyArchive: false } },
      { id: "feature", value: { someone: {} } },
    ]) };
    await expect(listGloballyEnabledOwners(db)).resolves.toEqual(["enabled"]);
  });

  it("enrolls every currently linked account when the global switch is enabled", () => {
    const archive = {
      listAccounts: jest.fn(() => []),
      upsertAccount: jest.fn(),
      restoreLinked: jest.fn(),
      setWeeklyEnabled: jest.fn(),
    };
    reconcileWeeklyArchiveAccounts("owner", true, [
      { uid: "130000001", region: "prod_gf_jp" },
      { uid: "130000002", region: "prod_gf_us" },
    ], archive as any);
    expect(archive.upsertAccount).toHaveBeenCalledTimes(2);
    expect(archive.setWeeklyEnabled).toHaveBeenCalledWith("owner", "130000002", true);
  });

  it("disables all official rows without changing manual rows", () => {
    const archive = {
      listAccounts: jest.fn(() => [
        { source: "official", uid: "1" }, { source: "manual", uid: "1" }, { source: "official", uid: "2" },
      ]),
      upsertAccount: jest.fn(),
      restoreLinked: jest.fn(),
      setWeeklyEnabled: jest.fn(),
    };
    reconcileWeeklyArchiveAccounts("owner", false, [], archive as any);
    expect(archive.setWeeklyEnabled.mock.calls).toEqual([
      ["owner", "1", false], ["owner", "2", false],
    ]);
  });
});
