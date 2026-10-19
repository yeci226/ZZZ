import { randomBytes } from "node:crypto";
import {
  ActionRowBuilder,
  EmbedBuilder,
  MessageFlags,
  StringSelectMenuBuilder,
  type Attachment,
  type ChatInputCommandInteraction,
  type StringSelectMenuInteraction,
} from "discord.js";

import { continueOfficialGachaArchive, type GachaImportContinuation } from "./gachaImportContinuation.js";
import {
  downloadRngMoeBackup,
  importRngMoeProfile,
  parseRngMoeBackup,
  RNG_MOE_BACKUP_MAX_BYTES,
  type ParsedRngMoeBackup,
  type RngMoeImportResult,
} from "./rngMoeImport.js";

interface PendingImport {
  ownerId: string;
  backup: ParsedRngMoeBackup;
  uid: string;
  expiresAt: number;
}

const pending = new Map<string, PendingImport>();
const PENDING_TTL_MS = 10 * 60 * 1000;

function cleanPending(): void {
  const now = Date.now();
  for (const [token, value] of pending) if (value.expiresAt <= now) pending.delete(token);
}

async function finishImport(
  ownerId: string,
  backup: ParsedRngMoeBackup,
  profileKey: string,
  suppliedUid: string,
): Promise<{ result: RngMoeImportResult; official: "synced" | "failed" | "unlinked" }> {
  const result = await importRngMoeProfile({ ownerId, backup, profileKey, uid: suppliedUid });
  return { result, official: await continueOfficialGachaArchive(ownerId, result.uid) };
}

function resultEmbed(
  result: RngMoeImportResult,
  official: GachaImportContinuation,
): EmbedBuilder {
  const continuation = official === "synced"
    ? "已接續同步官方紀錄。"
    : official === "failed"
      ? "舊紀錄已保存；本次官方同步失敗，之後可再重試。"
      : "尚未綁定此 UID；日後綁定相同 UID 即可接續官方紀錄。";
  return new EmbedBuilder()
    .setColor("#62D19E")
    .setTitle("rng.moe 紀錄匯入完成")
    .setDescription([
      `UID \`${result.uid}\``,
      `讀取 **${result.total}** 筆｜新增 **${result.inserted}** 筆｜重複 **${result.duplicates}** 筆｜衝突 **${result.conflicts}** 筆`,
      continuation,
    ].join("\n"));
}

export async function beginRngMoeImport(
  interaction: ChatInputCommandInteraction,
  attachment: Attachment,
  uid: string,
): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    if (!attachment.name.toLowerCase().endsWith(".json")) throw new Error("請上傳 rng.moe 匯出的 JSON 檔案");
    if (attachment.size > RNG_MOE_BACKUP_MAX_BYTES) throw new Error("rng.moe JSON 檔案不可超過 10 MiB");
    const backup = parseRngMoeBackup(await downloadRngMoeBackup(attachment.url));
    if (backup.profiles.length > 25) throw new Error("備份內的 Profile 超過 25 個，請先在 rng.moe 整理後重新匯出");
    if (backup.profiles.length === 1) {
      const { result, official } = await finishImport(
        interaction.user.id, backup, backup.profiles[0]!.key, uid,
      );
      await interaction.editReply({ embeds: [resultEmbed(result, official)] });
      return;
    }
    cleanPending();
    const token = randomBytes(8).toString("base64url");
    pending.set(token, {
      ownerId: interaction.user.id,
      backup,
      uid,
      expiresAt: Date.now() + PENDING_TTL_MS,
    });
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`rng-import-profile:${token}`)
      .setPlaceholder("選擇要匯入的 rng.moe Profile")
      .addOptions(backup.profiles.map((profile) => ({
        label: profile.name.slice(0, 100),
        description: `${profile.uid ? `UID ${profile.uid}｜` : "未設定 UID｜"}${profile.recordCount} 筆`.slice(0, 100),
        value: profile.key,
      })));
    await interaction.editReply({
      content: "這份備份包含多個 Profile，請選擇其中一個。",
      components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],
    });
  } catch (error: any) {
    await interaction.editReply({
      components: [],
      embeds: [new EmbedBuilder().setColor("#E76161").setTitle("rng.moe 匯入失敗")
        .setDescription(`\`${String(error?.message || error).slice(0, 900)}\``)],
    });
  }
}

export async function handleRngMoeProfileSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  cleanPending();
  const token = interaction.customId.split(":")[1] ?? "";
  const state = pending.get(token);
  if (!state || state.ownerId !== interaction.user.id) {
    await interaction.reply({ content: "這次匯入已過期，請重新執行 `/調頻 匯入`。", flags: MessageFlags.Ephemeral });
    return;
  }
  pending.delete(token);
  await interaction.deferUpdate();
  try {
    const { result, official } = await finishImport(
      state.ownerId, state.backup, interaction.values[0]!, state.uid,
    );
    await interaction.editReply({ content: null, components: [], embeds: [resultEmbed(result, official)] });
  } catch (error: any) {
    await interaction.editReply({
      content: null,
      components: [],
      embeds: [new EmbedBuilder().setColor("#E76161").setTitle("rng.moe 匯入失敗")
        .setDescription(`\`${String(error?.message || error).slice(0, 900)}\``)],
    });
  }
}
