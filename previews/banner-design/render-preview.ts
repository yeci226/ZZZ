import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { renderOfficialBanner } from "../../src/utilities/zzz/bannerRenderer.js";

const previewRoot = process.env.ZZZ_PREVIEW_OUTPUT_ROOT || join(process.cwd(), "previews");
const outputDirectory = join(previewRoot, "banner-design");
const now = Date.parse("2026-09-05T00:00:00.000Z");
const seconds = (milliseconds: number) => Math.floor(milliseconds / 1000);
const agentIcon = (id: string) => join(process.cwd(), "src", "assets", "images", "zzz", "paintings", `role_square_avatar_${id}.png`);
const weaponIcon = (id: string) => join(process.cwd(), "src", "assets", "images", "icons", "gacha", "weapon", `${id}.webp`);

const activeStart = seconds(now - 8 * 86_400_000);
const activeEnd = seconds(now + 4 * 86_400_000);
const futureStart = seconds(now + 5 * 86_400_000);
const futureEnd = seconds(now + 26 * 86_400_000);

const calendar = {
  avatar_gacha_schedule_list: [
    {
      gacha_id: "preview-agent-31-a", gacha_type: "GACHA_TYPE_CHARACTER_UP",
      gacha_state: "GACHA_STATE_IN_PROGRESS", version: "3.1", start_ts: activeStart, end_ts: activeEnd,
      avatar_list: [
        { id: "1491", full_name: "儀玄", rarity: "S", avatar_element_type: 205, avatar_profession: 6, icon: agentIcon("1491") },
        { id: "1431", full_name: "耀嘉音", rarity: "A", avatar_element_type: 200, avatar_profession: 1, icon: agentIcon("1431") },
        { id: "1021", full_name: "貓又", rarity: "A", avatar_element_type: 200, avatar_profession: 1, icon: agentIcon("1021") },
      ],
    },
    {
      gacha_id: "preview-agent-31-b", gacha_type: "GACHA_TYPE_CHARACTER_RETURN",
      gacha_state: "GACHA_STATE_IN_PROGRESS", version: "3.1", start_ts: activeStart, end_ts: activeEnd,
      sup_lock_show: true,
      avatar_list: [
        { id: "1091", full_name: "星見雅", rarity: "S", avatar_element_type: 202, avatar_profession: 3, icon: agentIcon("1091") },
        { id: "1411", full_name: "橘福福", rarity: "S", avatar_element_type: 201, avatar_profession: 2, icon: agentIcon("1411") },
        { id: "1591", full_name: "愛蓮", rarity: "S", avatar_element_type: 202, avatar_profession: 1, icon: agentIcon("1591") },
        { id: "1431", full_name: "耀嘉音", rarity: "A", avatar_element_type: 200, avatar_profession: 1, icon: agentIcon("1431") },
        { id: "1021", full_name: "貓又", rarity: "A", avatar_element_type: 200, avatar_profession: 1, icon: agentIcon("1021") },
      ],
    },
    {
      gacha_id: "preview-agent-32", gacha_type: "GACHA_TYPE_CHARACTER_UP",
      gacha_state: "GACHA_STATE_NOT_START", version: "3.2", start_ts: futureStart, end_ts: futureEnd,
      avatar_list: [
        { id: "1411", full_name: "橘福福", rarity: "S", avatar_element_type: 201, avatar_profession: 2, icon: agentIcon("1411") },
        { id: "1431", full_name: "耀嘉音", rarity: "S", avatar_element_type: 200, avatar_profession: 1, icon: agentIcon("1431") },
        { id: "1021", full_name: "貓又", rarity: "A", avatar_element_type: 200, avatar_profession: 1, icon: agentIcon("1021") },
      ],
    },
  ],
  weapon_gacha_schedule_list: [
    {
      gacha_id: "preview-weapon-31-a", gacha_type: "GACHA_TYPE_WEAPON_UP",
      gacha_state: "GACHA_STATE_IN_PROGRESS", version: "3.1", start_ts: activeStart, end_ts: activeEnd,
      weapon_list: [
        { id: "14110", talent_title: "青溟籠舍", rarity: "S", profession: 6, icon: weaponIcon("14110") },
        { id: "14126", talent_title: "聚寶箱", rarity: "A", profession: 4, icon: weaponIcon("14126") },
        { id: "14131", talent_title: "強音熱望", rarity: "A", profession: 1, icon: weaponIcon("14131") },
      ],
    },
    {
      gacha_id: "preview-weapon-31-b", gacha_type: "GACHA_TYPE_WEAPON_RETURN",
      gacha_state: "GACHA_STATE_IN_PROGRESS", version: "3.1", start_ts: activeStart, end_ts: activeEnd,
      sup_lock_show: false,
      weapon_list: [
        { id: "14107", talent_title: "霰落星殿", rarity: "S", profession: 3, icon: weaponIcon("14107") },
        { id: "14136", talent_title: "啜泣搖籃", rarity: "S", profession: 4, icon: weaponIcon("14136") },
        { id: "14120", talent_title: "嵌合編譯器", rarity: "A", profession: 3, icon: weaponIcon("14120") },
      ],
    },
    {
      gacha_id: "preview-weapon-32", gacha_type: "GACHA_TYPE_WEAPON_UP",
      gacha_state: "GACHA_STATE_NOT_START", version: "3.2", start_ts: futureStart, end_ts: futureEnd,
      weapon_list: [
        { id: "14116", talent_title: "焰心桂冠", rarity: "S", profession: 2, icon: weaponIcon("14116") },
        { id: "14117", talent_title: "時流賢者", rarity: "S", profession: 2, icon: weaponIcon("14117") },
        { id: "14121", talent_title: "貴重骨核", rarity: "A", profession: 1, icon: weaponIcon("14121") },
      ],
    },
  ],
};

const details = {
  tickets: [
    { ticket_type: "GACHA_TICKET_TYPE_POLYCHROME", ticket_cnt: 12160 },
    { ticket_type: "GACHA_TICKET_TYPE_ENCRYPTED_MASTER_TAPE", ticket_cnt: 23 },
    { ticket_type: "GACHA_TICKET_TYPE_MASTER_TAPE", ticket_cnt: 17 },
    { ticket_type: "GACHA_TICKET_TYPE_BOOPON", ticket_cnt: 36 },
  ],
  gacha_info_list: [
    { gacha_type: "GACHA_TYPE_CHARACTER_UP", more_s_need_cnt: 12 },
    { gacha_type: "GACHA_TYPE_CHARACTER_RETURN", more_s_need_cnt: 48 },
    { gacha_type: "GACHA_TYPE_WEAPON_UP", more_s_need_cnt: 9 },
    { gacha_type: "GACHA_TYPE_WEAPON_RETURN", more_s_need_cnt: 31 },
  ],
};

export function renderBannerPreview() {
  return renderOfficialBanner({
    uid: "130000000", locale: "tw", calendar, details, showPrivate: true, now,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  mkdirSync(outputDirectory, { recursive: true });
  writeFileSync(join(outputDirectory, "同期雙欄預覽.png"), await renderBannerPreview());
}
