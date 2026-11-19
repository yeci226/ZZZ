import {
  drainPendingLoginsBounded,
  earlyAckEphemeral,
  getInteractionPreflight,
  PENDING_LOGIN_DRAIN_BUDGET_MS,
} from "../src/utilities/shared/interactionPreflight";
import { getCommandAckPlan } from "../src/utilities/shared/index";

describe("drainPendingLoginsBounded", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("awaits a drain that finishes inside the budget", async () => {
    let done = false;
    const result = drainPendingLoginsBounded(async () => {
      await new Promise((r) => setTimeout(r, 100));
      done = true;
    });
    await jest.advanceTimersByTimeAsync(100);
    await expect(result).resolves.toBe(true);
    expect(done).toBe(true);
  });

  it("returns early for a slow drain and logs its later rejection", async () => {
    const onError = jest.fn();
    const result = drainPendingLoginsBounded(
      () => new Promise((_, reject) => setTimeout(() => reject(new Error("slow")), 5000)),
      onError,
    );
    await jest.advanceTimersByTimeAsync(PENDING_LOGIN_DRAIN_BUDGET_MS);
    await expect(result).resolves.toBe(false);
    expect(onError).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(5000);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("swallows a fast failure and a synchronous throw", async () => {
    const onError = jest.fn();
    await expect(drainPendingLoginsBounded(() => Promise.reject(new Error("x")), onError)).resolves.toBe(true);
    await expect(drainPendingLoginsBounded(() => { throw new Error("y"); }, onError)).resolves.toBe(true);
    expect(onError).toHaveBeenCalledTimes(2);
  });

  it("survives a throwing error handler without an unhandled rejection", async () => {
    await expect(
      drainPendingLoginsBounded(() => Promise.reject(new Error("x")), () => { throw new Error("log"); }),
    ).resolves.toBe(true);
  });
});

describe("early defer ephemerality", () => {
  const asked = (value: boolean | null) => ({ options: { getBoolean: () => value } });
  const bannerLike = { ephemeral: false };

  it("keeps /banner public unless private is requested", () => {
    const plan = getCommandAckPlan(bannerLike, { defaultEphemeral: true });
    expect(earlyAckEphemeral(plan.ephemeral, asked(null))).toBe(false);
    expect(earlyAckEphemeral(plan.ephemeral, asked(false))).toBe(false);
    expect(earlyAckEphemeral(plan.ephemeral, asked(true))).toBe(true);
  });

  it("never turns an ephemeral command public", () => {
    expect(earlyAckEphemeral(true, asked(false))).toBe(true);
  });

  it("does not defer or look anything up before the /contact-dev modal", () => {
    expect(getInteractionPreflight({ commandName: "contact-dev" })).toEqual({
      deferBeforeDrain: false,
      skipPendingLoginDrain: true,
      skipLocaleLookup: true,
    });
  });
});
