import { redeemCardRows, redeemCardGroups, redeemSummaryText, buildZZZRedeemCards } from "../src/utilities/canvas/redeemCard";
import { rewardName, normalizeRewardDetails, localizeReward, parseRewardText } from "../src/utilities/mimo/rewards";
import { locales } from "../src/utilities/settings/presentation";
import { createCanvas } from "@napi-rs/canvas";
const accounts = [{ uid: "1300000001", nickname: "Proxy", codes: [{ code: "PRIVATE-SECRET", status: "success" as const, privateCode: true, rewards: ["Polychrome ×60", "Denny ×20,000"] }, { code: "PRIVATE-SECRET", status: "awaiting" as const, rewards: ["Polychrome ×60"] }] }];
test("localized summaries preserve quantities, UID and real outcomes without private codes", () => {
  for (const locale of locales) {
    const text = redeemSummaryText({ accounts, locale, source: "mimo" });
    expect(text).toContain(rewardName("polychrome", locale)); expect(text).toContain("1300000001"); expect(text).not.toContain("PRIVATE-SECRET");
  }
  const rows = redeemCardRows({ accounts });
  expect(rows.map(r => r.reward?.quantity)).toEqual([60, 20000, 60]);
  expect(rows.map(r => r.result.status)).toEqual(["success", "success", "awaiting"]);
});
test("all reward images survive normalization and unknown quantities stay unknown", () => {
  expect(normalizeRewardDetails(["Polychrome ×60", "Denny ×20000"], ["first", "second"]).map(r => r.icon)).toEqual(["first", "second"]);
  expect(normalizeRewardDetails(["Unknown reward"])[0]).toMatchObject({ name: "Unknown reward", quantity: undefined });
});
test("long results create additional PNG pages instead of dropping rewards", async () => {
  const pages = await buildZZZRedeemCards({ locale: "tw", accounts: [{ ...accounts[0], codes: Array.from({ length: 8 }, () => ({ code: "SAMPLE", status: "success" as const, rewards: ["Polychrome ×60"] })) }] });
  expect(pages).toHaveLength(2);
  for (const png of pages) expect(png.subarray(1, 4).toString()).toBe("PNG");
});

test("every supported reward has a local official icon", async () => {
  const { rewardNames, rewardIcon } = await import("../src/utilities/mimo/rewards");
  const { safeImage } = await import("../src/utilities/settings/presentation");
  for (const kind of Object.keys(rewardNames)) {
    const icon = await safeImage(rewardIcon(kind));
    expect(icon).not.toBeNull();
    expect(icon!.width).toBeGreaterThan(20);
  }
});

test("one code with multiple rewards remains one result group", () => {
  const groups = redeemCardGroups(redeemCardRows({ accounts }));
  expect(groups).toHaveLength(2);
  expect(groups[0].result.status).toBe("success");
  expect(groups[0].rows.map(r => r.reward?.kind)).toEqual(["polychrome", "dennies"]);
  expect(groups[1].result.status).toBe("awaiting");
  expect(normalizeRewardDetails("Polychrome ×60 + Denny ×20,000、Senior Investigator Log ×2").map(r => r.quantity)).toEqual([60, 20000, 2]);
  expect(normalizeRewardDetails(["Polychrome ×60 + Denny ×20,000"]).map(r => r.quantity)).toEqual([60, 20000]);
});

test("the public ZENLESSGIFT description resolves every item, written quantity and locale", () => {
  const rewards = normalizeRewardDetails("50 polychrome, two official investigator logs,\u00a0three w-engine power supplies, and one bangboo algorithm module");
  expect(rewards.map(({ kind, quantity }) => ({ kind, quantity }))).toEqual([
    { kind: "polychrome", quantity: 50 },
    { kind: "officialLog", quantity: 2 },
    { kind: "power", quantity: 3 },
    { kind: "bangbooModule", quantity: 1 },
  ]);
  for (const locale of locales) {
    for (const reward of rewards) expect(localizeReward(reward, locale).name).toBe(rewardName(reward.kind!, locale));
  }
  expect(rewards.map(reward => localizeReward(reward, "tw").name)).toEqual([
    "菲林", "正式調查員記錄", "音擎能源蓄電池", "邦布演算法模組",
  ]);
});

test("quantity normalization preserves numeric formats, source icons and unknown amounts", () => {
  expect(normalizeRewardDetails("50 Polychrome, 2 Official Investigator Logs, Denny ×20,000").map(r => r.quantity)).toEqual([50, 2, 20000]);
  expect(parseRewardText("AND THREE W–Engine Power Supplies")).toMatchObject({ kind: "power", quantity: 3 });
  expect(parseRewardText("two official investigator logs", "official-icon")).toMatchObject({ kind: "officialLog", quantity: 2, icon: "official-icon" });
  expect(parseRewardText("Polychrome ×60")).toMatchObject({ kind: "polychrome", quantity: 60 });
  expect(parseRewardText("Denny*2,222")).toMatchObject({ kind: "dennies", quantity: 2222 });
  expect(parseRewardText("Unknown reward")).toMatchObject({ name: "Unknown reward", quantity: undefined });
});

test("each account starts a separate image even when the preceding page has spare room", async () => {
  const proto = Object.getPrototypeOf(createCanvas(1, 1).getContext("2d"));
  const spy = jest.spyOn(proto, "fillText");
  try {
    const codes = Array.from({ length: 7 }, (_, i) => ({ code: `SAMPLE${i}`, status: "success" as const, rewards: ["Polychrome ×60"] }));
    const pages = await buildZZZRedeemCards({ locale: "en", accounts: [
      { uid: "1300000001", nickname: "First", codes },
      { uid: "1300000002", nickname: "Second", codes: codes.slice(0, 1) },
    ] });
    expect(pages).toHaveLength(3);
    const pageUids: string[][] = [];
    for (const [text] of spy.mock.calls) {
      if (text === "Redemption results") pageUids.push([]);
      if (String(text).startsWith("UID ")) pageUids.at(-1)!.push(String(text));
    }
    expect(pageUids).toEqual([["UID 1300000001"], ["UID 1300000001"], ["UID 1300000002"]]);
  } finally { spy.mockRestore(); }
});
