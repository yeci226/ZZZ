import {
  requestZzzRecordApi,
  ZZZ_RECORD_API_BASE,
} from "../src/utilities/zzz/officialRecordApi.js";

describe("official record API query encoding", () => {
  it("passes map_ids as an array without coercing it to a scalar", async () => {
    const setQueryParams = jest.fn();
    const setDs = jest.fn();
    const send = jest.fn(async () => ({
      response: { retcode: 0, data: { ok: true } },
    }));
    const request = {
      setQueryParams(query: Record<string, unknown>) {
        setQueryParams(query);
        return request;
      },
      setDs() {
        setDs();
        return request;
      },
      send,
    };

    await expect(
      requestZzzRecordApi(
        {
          uid: "100000000",
          region: "prod_gf_us",
          lang: "zh-tw",
          record: { request },
        },
        "zenkov_detail",
        { map_ids: ["101", 102], difficulty: 2 },
      ),
    ).resolves.toEqual({ ok: true });

    expect(setQueryParams).toHaveBeenCalledWith(
      expect.objectContaining({
        map_ids: ["101", 102],
        difficulty: 2,
      }),
    );
    expect(setDs).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(`${ZZZ_RECORD_API_BASE}/zenkov_detail`);
  });
});
