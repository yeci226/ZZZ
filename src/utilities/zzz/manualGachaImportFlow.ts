import { randomBytes } from "node:crypto";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type ModalSubmitInteraction,
} from "discord.js";

import { importManualGachaArchive } from "./gachaSync.js";
import {
  continueOfficialGachaArchive,
  type GachaImportContinuation,
} from "./gachaImportContinuation.js";

interface PendingManualImport {
  ownerId: string;
  uid: string;
  expiresAt: number;
}

const pending = new Map<string, PendingManualImport>();
const PENDING_TTL_MS = 10 * 60 * 1000;

function cleanPending(): void {
  const now = Date.now();
  for (const [token, state] of pending) if (state.expiresAt <= now) pending.delete(token);
}

function stateFor(customId: string, ownerId: string): PendingManualImport | null {
  cleanPending();
  const token = customId.split(":").pop() ?? "";
  const state = pending.get(token);
  return state?.ownerId === ownerId ? state : null;
}

function continuationText(status: GachaImportContinuation): string {
  if (status === "synced") return "已接續同步官方紀錄。";
  if (status === "failed") return "匯入紀錄已保存；本次官方同步失敗，之後會再重試。";
  return "尚未綁定此 UID；日後綁定相同 UID 即可接續官方紀錄。";
}

function urlHelp(): string {
  return [
    "請在 Windows PowerShell 執行以下指令取得遊戲調頻 URL：",
    "```powershell",
    "Start-Process powershell -Verb runAs -ArgumentList '-NoExit -Command \"Invoke-Expression (New-Object Net.WebClient).DownloadString(\\\"https://raw.githubusercontent.com/yeci226/ZZZ-ToS-PP/main/getSignal.ps1\\\")\"'",
    "```",
  ].join("\n");
}

export async function beginManualGachaImport(
  interaction: ChatInputCommandInteraction,
  uid: string,
): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const suppliedUid = uid.trim();
  if (suppliedUid && !/^\d{8,10}$/.test(suppliedUid)) {
    await interaction.editReply({ content: "UID 格式不正確，請提供 8 至 10 位數字。" });
    return;
  }

  cleanPending();
  const token = randomBytes(8).toString("base64url");
  pending.set(token, {
    ownerId: interaction.user.id,
    uid: suppliedUid,
    expiresAt: Date.now() + PENDING_TTL_MS,
  });
  const uidText = suppliedUid
    ? `匯入資料必須屬於 UID \`${suppliedUid}\`。`
    : "未指定 UID，將由遊戲回傳資料辨識。";
  await interaction.editReply({
    embeds: [new EmbedBuilder()
      .setColor("#62D19E")
      .setTitle("匯入遊戲 URL 調頻紀錄")
      .setDescription(`${uidText}\nURL 僅用於本次讀取，不會保存。這個匯入畫面將於 10 分鐘後失效。`)],
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`gacha-url-open:${token}`)
        .setLabel("輸入 URL").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`gacha-url-help:${token}`)
        .setLabel("如何取得 URL").setStyle(ButtonStyle.Secondary),
    )],
  });
}

export async function handleManualGachaImportButton(interaction: ButtonInteraction): Promise<void> {
  const state = stateFor(interaction.customId, interaction.user.id);
  if (!state) {
    await interaction.reply({
      content: "這次匯入已過期，請重新執行 `/調頻 匯入`。",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (interaction.customId.startsWith("gacha-url-help:")) {
    await interaction.reply({ content: urlHelp(), flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.showModal(
    new ModalBuilder().setCustomId(`gacha-url-submit:${interaction.customId.split(":").pop()}`)
      .setTitle("匯入遊戲調頻 URL")
      .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("signalUrl")
          .setLabel("調頻紀錄 URL")
          .setPlaceholder("https://public-operation-nap-sg.hoyoverse.com/...")
          .setStyle(TextInputStyle.Paragraph).setRequired(true).setMinLength(50).setMaxLength(4000),
      )),
  );
}

export async function handleManualGachaImportSubmit(interaction: ModalSubmitInteraction): Promise<void> {
  const state = stateFor(interaction.customId, interaction.user.id);
  if (!state) {
    await interaction.reply({
      content: "這次匯入已過期，請重新執行 `/調頻 匯入`。",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const url = interaction.fields.getTextInputValue("signalUrl");
  await interaction.deferUpdate();
  try {
    const result = await importManualGachaArchive({
      ownerId: state.ownerId,
      uid: state.uid || undefined,
      url,
    });
    const continuation = await continueOfficialGachaArchive(state.ownerId, result.uid);
    pending.delete(interaction.customId.split(":").pop() ?? "");
    await interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor("#62D19E")
        .setTitle("URL 紀錄匯入完成")
        .setDescription([
          `UID \`${result.uid}\``,
          `讀取 **${result.fetched}** 筆｜新增 **${result.inserted}** 筆`,
          continuationText(continuation),
        ].join("\n"))],
      components: [],
    });
  } catch (error: any) {
    const message = String(error?.message || error)
      .replace(/\b(authkey|cookie|ltoken|stoken)=([^&\s;]+)/gi, "$1=[redacted]")
      .slice(0, 800);
    await interaction.followUp({
      embeds: [new EmbedBuilder().setColor("#E76161").setTitle("URL 紀錄匯入失敗")
        .setDescription(`\`${message}\``)],
      flags: MessageFlags.Ephemeral,
    });
  }
}
