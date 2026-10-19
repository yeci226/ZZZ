import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  type ButtonInteraction,
  type Client,
} from "discord.js";
import { existsSync } from "node:fs";

import { getDeveloperIds, isDeveloper } from "../contactDev.js";
import { createTranslator } from "../core/i18n.js";
import type { Notifier } from "./actions.js";
import { coverPath, removeCoverIfUnused } from "./covers.js";
import { PERMANENT_BAN } from "./rules.js";
import type { InterknotStore } from "./store.js";

export { PERMANENT_BAN };

export type ModAction = "restore" | "delete" | "ban7" | "banPerm";
const MOD_ACTIONS: ModAction[] = ["restore", "delete", "ban7", "banPerm"];
const BAN_7_DAYS_MS = 7 * 24 * 3600e3;
const MOD_PREFIX = "ik:mod:";
const MOD_LABEL: Record<ModAction, string> = {
  restore: "interknot_Mod_Restore",
  delete: "interknot_Mod_Delete",
  ban7: "interknot_Mod_Ban7",
  banPerm: "interknot_Mod_BanPerm",
};
// Moderation DMs go to the developers, who read Traditional Chinese.
const tr = createTranslator("tw") as (k: string, o?: any) => string;

/** Applies a developer decision; bans always hit the real author, even of anonymous content. */
export async function applyModeration(
  store: InterknotStore,
  action: ModAction,
  type: "post" | "comment",
  id: number,
  now: number,
  coverDir?: string,
): Promise<boolean> {
  const target = type === "post" ? store.getPost(id) : store.getComment(id);
  if (!target) return false;
  if (action === "restore") {
    // Only auto-hidden content comes back; deleted content stays deleted (its cover may already be gone).
    if (target.status !== "hidden") return false;
    if (type === "post") store.setPostStatus(id, "visible");
    else store.setCommentStatus(id, "visible");
    // A developer cleared it, so it needs three fresh reporters to be hidden again.
    store.clearReports(type, id);
    return true;
  }
  if (type === "post") {
    store.setPostStatus(id, "deleted");
    const hash = store.getPost(id)!.coverHash;
    if (hash) await removeCoverIfUnused(hash, store.coverRefCount(hash), coverDir);
  } else store.setCommentStatus(id, "deleted");
  if (action === "ban7") store.setBan(target.authorId, now + BAN_7_DAYS_MS);
  if (action === "banPerm") store.setBan(target.authorId, PERMANENT_BAN);
  return true;
}

const modButtons = (type: "post" | "comment", id: number, actions: ModAction[]) =>
  new ActionRowBuilder<ButtonBuilder>().addComponents(
    actions.map((a) =>
      new ButtonBuilder()
        .setCustomId(`${MOD_PREFIX}${a}:${type}:${id}`)
        .setLabel(tr(MOD_LABEL[a]))
        .setStyle(a === "restore" ? ButtonStyle.Success : ButtonStyle.Danger),
    ),
  );

async function dmDevelopers(client: Client, message: Parameters<import("discord.js").User["send"]>[0]): Promise<void> {
  await Promise.all(
    getDeveloperIds().map(async (id) => {
      try {
        await (await client.users.fetch(id)).send(message);
      } catch {
        console.warn("[interknot] developer DM failed");
      }
    }),
  );
}

export function createDevNotifier(client: Client, store: InterknotStore): Notifier {
  return {
    async newPost(postId) {
      const post = store.getPost(postId);
      if (!post) return;
      const author = store.getProfile(post.authorId);
      const cover = post.coverHash ? coverPath(post.coverHash) : null;
      const embed = new EmbedBuilder()
        .setTitle(`[${post.tag}]${post.title}`.slice(0, 256))
        .setDescription(post.body.slice(0, 4000))
        .addFields(
          { name: "作者", value: `<@${post.authorId}> (${author?.nickname ?? "?"})${post.anonymous ? " · 匿名" : ""}` },
          { name: "伺服器", value: post.guildId ?? "DM", inline: true },
          { name: "ID", value: String(post.id), inline: true },
        )
        .setTimestamp(post.createdAt);
      const files = cover && existsSync(cover) ? [new AttachmentBuilder(cover, { name: "cover.webp" })] : [];
      if (files.length) embed.setImage("attachment://cover.webp");
      await dmDevelopers(client, {
        content: tr("interknot_Mod_NewPost"),
        embeds: [embed],
        files,
        components: [modButtons("post", post.id, ["delete", "ban7", "banPerm"])],
        allowedMentions: { parse: [] },
      });
    },
    async autoHidden(type, id, reporters) {
      const target = type === "post" ? store.getPost(id) : store.getComment(id);
      if (!target) return;
      const text = "title" in target ? `[${target.tag}]${target.title}\n${target.body}` : `#${target.floor} F (post ${target.postId})\n${target.body}`;
      const embed = new EmbedBuilder()
        .setDescription(text.slice(0, 4000))
        .addFields({ name: "作者", value: `<@${target.authorId}>` }, { name: "類型", value: `${type} ${id}`, inline: true });
      await dmDevelopers(client, {
        content: tr("interknot_Mod_AutoHidden", { n: reporters }),
        embeds: [embed],
        components: [modButtons(type, id, ["restore", "delete", "ban7"])],
        allowedMentions: { parse: [] },
      });
    },
  };
}

export async function handleModerationButton(interaction: ButtonInteraction, store: InterknotStore): Promise<void> {
  if (!isDeveloper(interaction.user.id)) {
    await interaction.reply({ content: tr("interknot_NotDeveloper"), flags: MessageFlags.Ephemeral });
    return;
  }
  const [action, type, rawId] = interaction.customId.slice(MOD_PREFIX.length).split(":");
  const id = Number(rawId);
  if (!MOD_ACTIONS.includes(action as ModAction) || (type !== "post" && type !== "comment") || !Number.isInteger(id)) return;
  const done = await applyModeration(store, action as ModAction, type, id, Date.now());
  await interaction.update({
    content: done ? tr("interknot_Mod_Done", { action: tr(MOD_LABEL[action as ModAction]) }) : tr("interknot_NotFound"),
    components: [],
  });
}
