/**
 * Routing tests for `drainPendingLogins` (Plan C Task 3).
 *
 * Three branches:
 *   1. enriched payload with a ZZZ card (game_id=8)  → bindFromEnriched
 *   2. enriched payload without a ZZZ card           → bindHoyolabOnly
 *   3. no enriched payload                           → bindCookieToUser (legacy)
 *
 * Uses commonjs `jest.mock` (tsconfig.test.json sets module:"commonjs"),
 * not `jest.unstable_mockModule`.
 */
import { jest } from "@jest/globals";

// ---- mocks -----------------------------------------------------------------

const mockFetchPendingLogins: jest.Mock<any> = jest.fn();
const mockMarkConsumed: jest.Mock<any> = jest.fn();
const mockDecryptString: jest.Mock<any> = jest.fn((s: string) => `decrypted(${s})`);

const mockGetAllGameRoles: jest.Mock<any> = jest.fn();
const mockUpdateAccountInfo: jest.Mock<any> = jest.fn();

const mockUpsertHoyolab: jest.Mock<any> = jest.fn();
const mockUpsertCharacter: jest.Mock<any> = jest.fn();

const mockDbGet: jest.Mock<any> = jest.fn();
const mockUserSend: jest.Mock<any> = jest.fn();
const mockUsersFetch: jest.Mock<any> = jest.fn(async () => ({ send: mockUserSend }));

jest.mock("../src/utilities/core/supabase.js", () => ({
  fetchPendingLogins: (...args: any[]) => (mockFetchPendingLogins as any)(...args),
  markConsumed: (...args: any[]) => (mockMarkConsumed as any)(...args),
  decryptString: (...args: any[]) => (mockDecryptString as any)(...args),
}));

jest.mock("../src/utilities/utilities.js", () => ({
  getAllGameRoles: (...args: any[]) => (mockGetAllGameRoles as any)(...args),
  updateAccountInfo: (...args: any[]) => (mockUpdateAccountInfo as any)(...args),
}));

jest.mock("../src/utilities/accountStore.js", () => ({
  upsertHoyolab: (...args: any[]) => (mockUpsertHoyolab as any)(...args),
  upsertCharacter: (...args: any[]) => (mockUpsertCharacter as any)(...args),
}));

jest.mock("../src/utilities/core/config.js", () => ({
  getConfig: () => ({ DEVIDS: [] }),
}));

jest.mock("../src/utilities/core/logger.js", () => ({
  __esModule: true,
  default: class {
    info() {}
    warn() {}
    error() {}
    success() {}
  },
}));

jest.mock("../src/index.js", () => ({
  client: {
    db: { get: (...args: any[]) => (mockDbGet as any)(...args) },
    users: { fetch: (...args: any[]) => (mockUsersFetch as any)(...args) },
  },
}));

// Sync import — commonjs.
import { drainPendingLogins } from "../src/utilities/webhookLogin";

// ---- helpers ---------------------------------------------------------------

function row(opts: { id: number; enriched?: any }) {
  return {
    id: opts.id,
    discord_id: "u1",
    ltuid_v2: "L1",
    encrypted_cookies: "enc",
    hoyo_account: null,
    enriched: opts.enriched ?? null,
    created_at: "2026-04-27T00:00:00.000Z",
  };
}

const ZZZ_CARD = {
  game_id: 8,
  game_role_id: "1500111111",
  nickname: "Wise",
  level: 55,
  region: "prod_gf_jp",
  region_name: "Asia",
  game_name: "Zenless Zone Zero",
  logo: "logo.png",
  background_image: "cov1.png",
  background_image_v2: "cov2.png",
  data: [
    { name: "Active Days", value: "100" },
    { name: "Agents", value: "20" },
    { name: "W-Engines", value: "30" },
    { name: "Bangboo", value: "10" },
    { name: "extra", value: "ignored" },
  ],
};

const HSR_CARD = {
  game_id: 6,
  game_role_id: "800000001",
  nickname: "HSRPlayer",
  level: 70,
  region: "prod_official_asia",
  region_name: "Asia",
};

beforeEach(() => {
  jest.clearAllMocks();
  mockDbGet.mockResolvedValue([] as any);
});

// ---- tests -----------------------------------------------------------------

describe("drainPendingLogins routing", () => {
  it("enriched-with-ZZZ-card → bindFromEnriched (no Hoyolab API)", async () => {
    mockFetchPendingLogins.mockResolvedValue([
      row({
        id: 1,
        enriched: {
          ltuid_v2: "L1",
          cards: [ZZZ_CARD],
          fetched_at: "2026-04-27T01:00:00.000Z",
        },
      }),
    ] as any);

    const out = await drainPendingLogins("u1");

    expect(mockGetAllGameRoles).not.toHaveBeenCalled();
    expect(mockUpsertHoyolab).toHaveBeenCalledTimes(1);
    expect(mockUpsertCharacter).toHaveBeenCalledTimes(1);

    const charArg = (mockUpsertCharacter as any).mock.calls[0][3];
    expect(charArg.uid).toBe("1500111111");
    expect(charArg.level).toBe(55);
    expect(charArg.region_name).toBe("Asia");
    expect(charArg.cover).toBe("cov2.png");
    expect(charArg.stats).toHaveLength(4);

    expect(out).toEqual([{ uid: "1500111111", nickname: "Wise" }]);
    expect(mockMarkConsumed).toHaveBeenCalledWith(1);
  });

  it("enriched-without-ZZZ-card → bindHoyolabOnly (no character, no DM)", async () => {
    mockFetchPendingLogins.mockResolvedValue([
      row({
        id: 2,
        enriched: {
          ltuid_v2: "L1",
          cards: [HSR_CARD],
          fetched_at: "2026-04-27T01:00:00.000Z",
        },
      }),
    ] as any);

    const out = await drainPendingLogins("u1");

    expect(mockGetAllGameRoles).not.toHaveBeenCalled();
    expect(mockUpsertHoyolab).toHaveBeenCalledTimes(1);
    expect(mockUpsertCharacter).not.toHaveBeenCalled();
    expect(out).toEqual([]);
    expect(mockMarkConsumed).toHaveBeenCalledWith(2);
  });

  it("no enriched payload → falls back to bindCookieToUser (calls getAllGameRoles)", async () => {
    mockFetchPendingLogins.mockResolvedValue([row({ id: 3 })] as any);
    mockGetAllGameRoles.mockResolvedValue([
      { gameId: 8, uid: "1500999999", nickname: "Legacy" },
    ] as any);

    const out = await drainPendingLogins("u1");

    expect(mockGetAllGameRoles).toHaveBeenCalledTimes(1);
    expect(mockUpdateAccountInfo).toHaveBeenCalledTimes(1);
    expect(out).toEqual([{ uid: "1500999999", nickname: "Legacy" }]);
    expect(mockMarkConsumed).toHaveBeenCalledWith(3);
  });
});
