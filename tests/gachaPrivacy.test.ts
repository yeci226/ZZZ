import { canViewPrivateGacha, isGachaPublic } from "../src/utilities/zzz/gachaPrivacy.js";

function db(value: unknown) {
  return { get: jest.fn().mockResolvedValue(value) };
}

describe("gacha archive privacy", () => {
  it("is public by default and always allows the owner", async () => {
    expect(await isGachaPublic(db(undefined), "owner")).toBe(true);
    expect(await canViewPrivateGacha(db(false), "owner", "owner")).toBe(true);
  });

  it("blocks other viewers immediately after privacy is disabled", async () => {
    expect(await canViewPrivateGacha(db(false), "viewer", "owner")).toBe(false);
    expect(await canViewPrivateGacha(db(true), "viewer", "owner")).toBe(true);
  });
});
