import { resolveInteractionLocale } from "../src/utilities/core/interactionLocale.js";

describe("interaction locale resolution", () => {
  it("falls back when cache and locale database operations fail", async () => {
    const onError = jest.fn();

    await expect(
      resolveInteractionLocale({
        loadCached: async () => {
          throw new Error("cache unavailable");
        },
        setupDefault: async () => {
          throw new Error("database unavailable");
        },
        reload: async () => {
          throw new Error("database unavailable");
        },
        fallbackLocale: "zh-TW",
        onError,
      }),
    ).resolves.toBe("zh-TW");

    expect(onError).toHaveBeenCalledTimes(3);
  });

  it("uses the locale loaded after default initialization", async () => {
    const setupDefault = jest.fn().mockResolvedValue(undefined);

    await expect(
      resolveInteractionLocale({
        loadCached: async () => undefined,
        setupDefault,
        reload: async () => "tw",
        fallbackLocale: "en",
      }),
    ).resolves.toBe("tw");

    expect(setupDefault).toHaveBeenCalledTimes(1);
  });
});
