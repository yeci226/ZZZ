import { shouldLoadAccountData } from "../src/utilities/core/accountInteraction.js";

describe("account interaction preflight", () => {
  it("does not load account data before showing the cookie modal", () => {
    expect(shouldLoadAccountData("SetUserCookie")).toBe(false);
  });

  it("loads account data for non-modal account options", () => {
    expect(shouldLoadAccountData("ViewAccount")).toBe(true);
    expect(shouldLoadAccountData("BindAccountByWebLogin")).toBe(true);
  });
});