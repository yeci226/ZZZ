import { getInteractionPreflight } from "../src/utilities/shared/interactionPreflight.js";

type FakeInteraction = {
  commandName: string;
  options: {
    getString: (name: string) => string | null;
    getSubcommand: (required?: boolean) => string | null;
  };
};

function fakeInteraction(
  commandName: string,
  strings: Record<string, string> = {},
  subcommand: string | null = null,
): FakeInteraction {
  return {
    commandName,
    options: {
      getString: (name) => strings[name] ?? null,
      getSubcommand: () => subcommand,
    },
  };
}

describe("interaction preflight", () => {
  it("defers account web-login commands before the pending-login drain", () => {
    expect(
      getInteractionPreflight(
        fakeInteraction("account", { options: "BindAccountByWebLogin" }),
      ),
    ).toEqual({
      deferBeforeDrain: true,
      skipPendingLoginDrain: false,
      skipLocaleLookup: false,
    });
  });

  it("skips the drain for account cookie modals", () => {
    expect(
      getInteractionPreflight(
        fakeInteraction("account", { options: "SetUserCookie" }),
      ),
    ).toEqual({
      deferBeforeDrain: false,
      skipPendingLoginDrain: true,
      skipLocaleLookup: true,
    });
  });

  it("skips the drain for signal log query modals", () => {
    expect(
      getInteractionPreflight(
        fakeInteraction("signal", { options: "query" }, "log"),
      ),
    ).toEqual({
      deferBeforeDrain: false,
      skipPendingLoginDrain: true,
      skipLocaleLookup: true,
    });
  });

  it("preserves the resolver context when Discord option methods use this", () => {
    type ContextualOptions = {
      values: { options: string };
      getString(this: ContextualOptions, name: string): string | null;
      getSubcommand(): string | null;
    };
    const options: ContextualOptions = {
      values: { options: "SetUserCookie" },
      getString(this: ContextualOptions, name: string) {
        return this.values[name as "options"] ?? null;
      },
      getSubcommand() {
        return null;
      },
    };

    expect(
      getInteractionPreflight({ commandName: "account", options }),
    ).toEqual({
      deferBeforeDrain: false,
      skipPendingLoginDrain: true,
      skipLocaleLookup: true,
    });
  });

  it("keeps the existing drain behavior for unrelated commands", () => {
    expect(getInteractionPreflight(fakeInteraction("profile"))).toEqual({
      deferBeforeDrain: false,
      skipPendingLoginDrain: false,
      skipLocaleLookup: false,
    });
  });
});
