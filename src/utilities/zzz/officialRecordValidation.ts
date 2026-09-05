import type { ZzzRecordEndpoint } from "./officialRecordApi.js";

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function arrayOrMissing(value: unknown): boolean {
  return value === undefined || value === null || Array.isArray(value);
}

function anyInvalidArray(...values: unknown[]): boolean {
  return values.some((value) => value !== undefined && value !== null && !Array.isArray(value));
}

export function validateOfficialRecordPayload(endpoint: ZzzRecordEndpoint | "note", data: unknown): string[] {
  if (!object(data)) return [`${endpoint}: response data is not an object`];
  const issues: string[] = [];
  if (endpoint === "note") {
    if (!object(data.energy)) issues.push("note.energy is missing");
    return issues;
  }
  if (endpoint === "activity_calendar") {
    if (anyInvalidArray(data.activity_list, data.list)) issues.push("activity calendar list is invalid");
  } else if (endpoint === "gacha_calendar") {
    for (const key of ["avatar_gacha_schedule_list", "weapon_gacha_schedule_list", "standard_gacha_schedule_list", "bangboo_gacha_schedule_list"]) {
      if (!arrayOrMissing(data[key])) issues.push(`${key} is invalid`);
    }
  } else if (endpoint === "cur_gacha_detail") {
    if (!arrayOrMissing(data.tickets)) issues.push("cur_gacha_detail.tickets is invalid");
    if (!arrayOrMissing(data.gacha_info_list)) issues.push("cur_gacha_detail.gacha_info_list is invalid");
  } else if (endpoint === "gacha_record") {
    if (!arrayOrMissing(data.gacha_item_list)) issues.push("gacha_record.gacha_item_list is invalid");
  } else if (endpoint === "zenkov_abstract_info") {
    if (!arrayOrMissing(data.map_list)) issues.push("zenkov_abstract_info.map_list is invalid");
    if (data.collection_data !== undefined && !object(data.collection_data)) issues.push("zenkov_abstract_info.collection_data is invalid");
  } else if (endpoint === "zenkov_detail") {
    if (anyInvalidArray(data.record_list, data.records, data.challenge_record_list)) {
      issues.push("zenkov_detail record list is invalid");
    }
  }
  return issues;
}

export function sanitizeOfficialValidationError(error: unknown): string {
  return String(error instanceof Error ? error.message : error)
    .replace(/(authkey|cookie|ltoken_v2|ltmid_v2|ltuid_v2)=([^&;\s]+)/gi, "$1=[redacted]")
    .replace(/[A-Za-z0-9_-]{80,}/g, "[redacted]")
    .slice(0, 500);
}
