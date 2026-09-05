export const ZZZ_RECORD_API_BASE =
  "https://sg-public-api.hoyolab.com/event/game_record_zzz/api/zzz";

export type ZzzRecordEndpoint =
  | "activity_calendar"
  | "gacha_calendar"
  | "cur_gacha_detail"
  | "gacha_record"
  | "zenkov_abstract_info"
  | "zenkov_detail";

export type ZzzRecordQueryScalar = string | number | boolean;
export type ZzzRecordQueryValue =
  ZzzRecordQueryScalar | readonly (string | number)[];

export async function requestZzzRecordApi<T = any>(
  zzz: any,
  endpoint: ZzzRecordEndpoint,
  extraQuery: Record<string, ZzzRecordQueryValue | undefined> = {},
): Promise<T> {
  const request = zzz?.record?.request;
  if (!request) throw new Error("ZZZ record request client is unavailable");
  const query: Record<string, ZzzRecordQueryValue> = {
    region: String(zzz.region ?? ""),
    uid: String(zzz.uid ?? ""),
    lang: String(zzz.lang ?? "zh-tw"),
  };
  for (const [key, value] of Object.entries(extraQuery)) {
    if (value !== undefined) query[key] = value;
  }
  request.setQueryParams(query).setDs();
  const { response } = await request.send(`${ZZZ_RECORD_API_BASE}/${endpoint}`);
  if (!response || Number(response.retcode) !== 0) {
    const error = new Error(
      String(
        response?.message || response?.msg || `HoYoLAB ${endpoint} failed`,
      ),
    ) as Error & { code?: number };
    error.code = Number(response?.retcode);
    throw error;
  }
  return response.data as T;
}

export async function loadOfficialNoteData(zzz: any) {
  const note = await zzz.record.note();
  let calendar: any = { activity_list: [] };
  try {
    calendar = await requestZzzRecordApi(zzz, "activity_calendar");
  } catch {
    // Note remains useful when the optional calendar endpoint is unavailable.
  }
  return { note, calendar };
}
