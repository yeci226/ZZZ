import { createCanvas } from "@napi-rs/canvas";
import path from "node:path";
import { uiFont, uiLocale, uiText, safeImage, numberLocale, type UiLocale } from "../settings/presentation.js";
import { normalizeRewardDetails, localizeReward, rewardLabel, rewardIcon, type RewardDetail } from "../mimo/rewards.js";
import type { RedeemResultStatus } from "../zzz/redeemLayout.js";

export interface ZZZRedeemCodeResult {
  code: string;
  rewards?: string[] | string;
  rewardIcons?: string[];
  rewardDetails?: RewardDetail[];
  status: RedeemResultStatus | "awaiting";
  privateCode?: boolean;
}
export interface ZZZRedeemAccountResult { nickname: string; uid: string; title?: string; codes: ZZZRedeemCodeResult[] }
export interface ZZZRedeemCardPayload {
  accounts: ZZZRedeemAccountResult[];
  locale?: string;
  source?: "manual" | "auto" | "mimo";
  at?: number;
  points?: { earned: number; spent: number; remaining: number };
}
export const ZZZ_REDEEM_BACKGROUND = path.resolve("src/assets/images/profileBgDark.png");
const colors = { success: "#d2ee8d", already_claimed: "#9bb7d2", awaiting: "#e8cd8d", invalid: "#e9a897", failed: "#e9a897" };
interface Row { account: ZZZRedeemAccountResult; result: ZZZRedeemCodeResult; reward?: RewardDetail }
export function redeemCardRows(payload: ZZZRedeemCardPayload): Row[] {
  const rows: Row[] = [];
  for (const account of payload.accounts) {
    for (const result of [...account.codes].sort((a, b) => Number(b.status === "success") - Number(a.status === "success"))) {
      const details = result.rewardDetails || normalizeRewardDetails(result.rewards, result.rewardIcons);
      for (const reward of details.length ? details : [undefined]) rows.push({ account, result, reward });
    }
  }
  return rows;
}
function statusText(locale: UiLocale, status: ZZZRedeemCodeResult["status"]) { return uiText(locale, status === "failed" ? "redeemFailed" : status); }
function lines(ctx: any, value: string, width: number, max = 2): string[] {
  const result: string[] = []; let line = "";
  for (const token of value.match(/\S+\s*/g) || []) {
    if (ctx.measureText(line + token.trimEnd()).width > width && line) { result.push(line.trim()); line = ""; }
    for (const c of token) {
      if (ctx.measureText(line + c).width > width && line) { result.push(line.trim()); line = ""; }
      line += c;
    }
  }
  if (line.trim()) result.push(line.trim());
  if (result.length > max) { result.length = max; result[max - 1] = result[max - 1].slice(0, -1) + "…"; }
  return result;
}
export interface RedeemGroup { account: ZZZRedeemAccountResult; result: ZZZRedeemCodeResult; rows: Row[] }
/** One exchange result owns all its rewards, including when continued on another page. */
export function redeemCardGroups(rows: Row[]): RedeemGroup[] {
  const groups: RedeemGroup[] = [];
  for (const row of rows) {
    let group = groups[groups.length - 1];
    if (!group || group.account !== row.account || group.result !== row.result) { group = { account: row.account, result: row.result, rows: [] }; groups.push(group); }
    group.rows.push(row);
  }
  return groups;
}
interface ReceiptBlock { group: RedeemGroup; x: number; y: number; width: number; height: number; columns: number }
function receiptLayout(rows: Row[]) {
  const accounts: { account: ZZZRedeemAccountResult; y: number; blocks: ReceiptBlock[] }[] = [];
  let cursor = 0, used = 0, shelfHeight = 0;
  for (const group of redeemCardGroups(rows)) {
    let account = accounts[accounts.length - 1];
    if (!account || account.account !== group.account) {
      cursor += shelfHeight; used = 0; shelfHeight = 0;
      account = { account: group.account, y: cursor, blocks: [] }; accounts.push(account); cursor += 60;
    }
    const columns = Math.min(3, group.rows.length);
    if (used + columns > 3) { cursor += shelfHeight; used = 0; shelfHeight = 0; }
    const height = 54 + Math.ceil(group.rows.length / columns) * 184;
    account.blocks.push({ group, x: 28 + used * 293, y: cursor, width: columns * 293 - 15, height, columns });
    used += columns; shelfHeight = Math.max(shelfHeight, height + 14);
  }
  return { accounts, height: cursor + shelfHeight };
}
async function renderPage(payload: ZZZRedeemCardPayload, rows: Row[], page: number, total: number): Promise<Buffer> {
  const locale = uiLocale(payload.locale), font = uiFont(locale), width = 920, layout = receiptLayout(rows);
  const headerHeight = 98 + (payload.points ? 56 : 0);
  const canvas = createCanvas(width, headerHeight + layout.height + (rows.length ? 34 : 108));
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#14171b"; ctx.fillRect(0, 0, width, canvas.height);
  const background = await safeImage(ZZZ_REDEEM_BACKGROUND);
  if (background) { ctx.globalAlpha = 0.15; ctx.drawImage(background, 0, 0, width, canvas.height); ctx.globalAlpha = 1; }
  ctx.fillStyle = "#dced9e"; ctx.fillRect(28, 27, 4, 31);
  ctx.fillStyle = "#f5f7f9"; ctx.font = `400 27px ${font}`;
  ctx.fillText((payload.source === "mimo" ? "Mimo · " : "") + uiText(locale, "result"), 48, 52);
  ctx.font = `400 16px ${font}`; ctx.fillStyle = "#b9c1ca";
  ctx.fillText(new Intl.DateTimeFormat(numberLocale[locale], { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Taipei" }).format(payload.at ?? Date.now()) + " · UTC+8", 30, 81);
  if (total > 1) { ctx.textAlign = "right"; ctx.fillText(`${page + 1} / ${total}`, width - 30, 50); ctx.textAlign = "left"; }
  if (payload.points) {
    const p = payload.points;
    ctx.font = `400 18px ${font}`; ctx.fillStyle = "#d3e4b0";
    ctx.fillText(`${uiText(locale, "points")} · ${uiText(locale, "earned")} +${p.earned}   ${uiText(locale, "spent")} -${p.spent}   ${uiText(locale, "remaining")} ${p.remaining}`, 30, 125, 860);
  }
  for (const account of layout.accounts) {
    const y = headerHeight + account.y;
    ctx.textAlign = "left"; ctx.fillStyle = "#edf1f5"; ctx.font = `400 21px ${font}`; ctx.fillText(account.account.nickname || account.account.uid, 30, y + 22, 530);
    ctx.fillStyle = "#c7d0da"; ctx.font = `400 17px ${font}`; ctx.fillText(`UID ${account.account.uid}`, 30, y + 46);
    for (const block of account.blocks) {
      const { x, width: w, height, columns, group } = block, top = headerHeight + block.y, result = group.result;
      ctx.fillStyle = "#1e2329"; ctx.beginPath(); ctx.roundRect(x, top, w, height, 12); ctx.fill();
      ctx.fillStyle = colors[result.status]; ctx.beginPath(); ctx.roundRect(x + 14, top, w - 28, 3, 1); ctx.fill();
      const count = result.rewardDetails?.length || normalizeRewardDetails(result.rewards, result.rewardIcons).length;
      const countLabel = count > 1 ? `${group.rows.length < count ? `${group.rows.length}/${count}` : count} ${uiText(locale, "items")}` : "";
      ctx.textAlign = "left"; ctx.font = `400 16px ${font}`;
      ctx.fillText(statusText(locale, result.status), x + 14, top + 25, w - (countLabel ? 100 : 28));
      if (countLabel) { ctx.textAlign = "right"; ctx.fillText(countLabel, x + w - 14, top + 25, 80); }
      ctx.textAlign = "left"; ctx.font = `400 12px ${font}`; ctx.fillStyle = "#b0bac5";
      const identifier = payload.source === "mimo" || result.privateCode ? `Mimo #${group.account.codes.indexOf(result) + 1}` : result.code;
      ctx.fillText(identifier.slice(0, 100), x + 14, top + 44, w - 28);
      const tileWidth = (w - 20 - (columns - 1) * 12) / columns;
      for (const [index, row] of group.rows.entries()) {
        const tileX = x + 10 + (index % columns) * (tileWidth + 12), tileY = top + 54 + Math.floor(index / columns) * 184, center = tileX + tileWidth / 2;
        const reward = row.reward ? localizeReward(row.reward, locale) : undefined;
        ctx.fillStyle = "#292e35"; ctx.beginPath(); ctx.roundRect(tileX, tileY, tileWidth, 174, 9); ctx.fill();
        ctx.font = `400 20px ${font}`;
        const nameLines = lines(ctx, reward?.name || uiText(locale, "unknownReward"), tileWidth - 24);
        const iconSize = nameLines.length > 1 ? 56 : 70;
        const image = (await safeImage(rewardIcon(reward?.kind))) || await safeImage(reward?.icon);
        if (image) { const scale = iconSize / Math.max(image.width, image.height); ctx.drawImage(image, center - image.width * scale / 2, tileY + 12 + (iconSize - image.height * scale) / 2, image.width * scale, image.height * scale); }
        else {
          // A neutral gift symbol keeps unavailable artwork distinct from a broken image.
          ctx.fillStyle = "#8793a1";
          ctx.fillRect(center - 22, tileY + 40, 44, 29);
          ctx.fillRect(center - 26, tileY + 32, 52, 10);
          ctx.strokeStyle = "#c7d0da"; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(center, tileY + 32); ctx.lineTo(center, tileY + 69);
          ctx.moveTo(center, tileY + 32); ctx.bezierCurveTo(center - 28, tileY + 32, center - 17, tileY + 10, center, tileY + 32);
          ctx.bezierCurveTo(center + 17, tileY + 10, center + 28, tileY + 32, center, tileY + 32); ctx.stroke();
        }
        ctx.textAlign = "center"; ctx.fillStyle = "#f2f4f7"; ctx.font = `400 20px ${font}`;
        nameLines.forEach((line, i) => ctx.fillText(line, center, tileY + 104 + (i - (nameLines.length - 1) / 2) * 23, tileWidth - 24));
        if (reward?.quantity !== undefined) { ctx.fillStyle = colors[result.status]; ctx.font = `400 27px ${font}`; ctx.fillText(`× ${reward.quantity.toLocaleString(numberLocale[locale])}`, center, tileY + 149, tileWidth - 24); }
      }
    }
  }
  ctx.textAlign = "left";
  if (!rows.length) { ctx.fillStyle = "#cad0d7"; ctx.font = `20px ${font}`; ctx.fillText(uiText(locale, "unavailable"), 30, headerHeight + 35); }
  ctx.fillStyle = "#b4bec9"; ctx.font = `400 15px ${font}`; ctx.fillText(uiText(locale, "mail"), 30, canvas.height - 15, 860);
  return canvas.toBuffer("image/png");
}
export async function buildZZZRedeemCards(payload: ZZZRedeemCardPayload): Promise<Buffer[]> {
  const pageRows: Row[][] = [], pages: Buffer[] = [];
  // Never put the end of one account and the start of another on the same image.
  for (const account of payload.accounts) {
    const rows = redeemCardRows({ ...payload, accounts: [account] });
    for (let i = 0; i < rows.length; i += 6) pageRows.push(rows.slice(i, i + 6));
  }
  if (!pageRows.length) pageRows.push([]);
  for (let i = 0; i < pageRows.length; i++) pages.push(await renderPage(payload, pageRows[i], i, pageRows.length));
  return pages;
}
export async function renderZZZRedeemCard(payload: ZZZRedeemCardPayload): Promise<Buffer> { return (await buildZZZRedeemCards(payload))[0]; }
export const buildZZZRedeemCard = renderZZZRedeemCard;

/** Text fallback uses the same actual outcomes and never reveals private codes. */
export function redeemSummaryText(payload: ZZZRedeemCardPayload): string {
  const locale = uiLocale(payload.locale);
  return [uiText(locale, "result"), ...payload.accounts.flatMap(account => [
    `${account.nickname} · UID ${account.uid}`,
    ...account.codes.map(result => `${statusText(locale, result.status)} · ${(result.rewardDetails || normalizeRewardDetails(result.rewards, result.rewardIcons)).map(r => rewardLabel(r, locale)).join(" / ") || uiText(locale, "unknownReward")}`),
  ])].join("\n");
}
