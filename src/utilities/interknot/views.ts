import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  FileUploadBuilder,
  LabelBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";

import { coverPath } from "./covers.js";
import { encodeIkId, type IkState, type MainTab, type SubTab } from "./customId.js";
import { commentPageFloors, renderDetail } from "./detailRenderer.js";
import { renderFeed } from "./feedRenderer.js";
import { isNew, LIMITS, TAGS } from "./rules.js";
import { AVATAR_IDS, renderAvatarSheet } from "./setupRenderer.js";
import type { DetailComment } from "./detailRenderer.js";
import type { Comment, InterknotStore, Post, Profile } from "./store.js";

export interface ViewCtx {
  store: InterknotStore;
  viewerId: string;
  guildId: string | null;
  isDeveloper: boolean;
  locale: string;
  tr: (k: string, o?: any) => string;
  now: number;
}

export interface MessagePayload {
  content?: string;
  embeds: [];
  files: AttachmentBuilder[];
  components: ActionRowBuilder<any>[];
  attachments: [];
}

const MAINS: MainTab[] = ["all", "guild", "mine"];
const SUBS: SubTab[] = ["all", "featured", "help"];
const MAIN_KEYS = ["interknot_Tab_Push", "interknot_Tab_Guild", "interknot_Tab_Mine"];
const SUB_KEYS = ["interknot_Tab_All", "interknot_Tab_Featured", "interknot_Tab_Help"];
const ANONYMOUS_AVATAR = 1;

export function displayAuthor(
  p: { anonymous: boolean; nickname: string; avatarId: number },
  tr: ViewCtx["tr"],
): { nickname: string; avatarId: number } {
  return p.anonymous ? { nickname: tr("interknot_Anonymous"), avatarId: ANONYMOUS_AVATAR } : { nickname: p.nickname, avatarId: p.avatarId };
}

const tagTitle = (ctx: ViewCtx, p: Pick<Post, "tag" | "title">) => `[${ctx.tr(`interknot_Tag_${p.tag}`)}]${p.title}`;
// Discord measures limits in UTF-16 units, so cut by .length while keeping whole code points.
const clip = (s: string, n: number) => {
  if (s.length <= n) return s;
  let out = "";
  for (const ch of s) {
    if (out.length + ch.length > n - 1) break;
    out += ch;
  }
  return out + "…";
};
const button = (id: string, label: string, style = ButtonStyle.Secondary) =>
  new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);
const row = (...c: (ButtonBuilder | StringSelectMenuBuilder)[]) => new ActionRowBuilder<any>().addComponents(...c);
const payload = (files: AttachmentBuilder[], components: ActionRowBuilder<any>[], content?: string): MessagePayload => ({
  // Always set content so editing over the setup screen clears its intro text.
  content: content ?? "",
  embeds: [],
  files,
  components,
  attachments: [],
});

/** DMs have no server tab, so fall back to the global feed. */
const normalize = (ctx: ViewCtx, s: IkState): IkState => (s.main === "guild" && !ctx.guildId ? { ...s, main: "all" } : s);

export async function buildSetupMessage(ctx: ViewCtx): Promise<MessagePayload> {
  return payload(
    [new AttachmentBuilder(await renderAvatarSheet(), { name: "interknot-avatars.png" })],
    [row(button(encodeIkId("setup", { main: "all", sub: "all", page: 0 }), ctx.tr("interknot_CreateAccount"), ButtonStyle.Primary))],
    ctx.tr("interknot_SetupIntro"),
  );
}

export async function buildFeedMessage(ctx: ViewCtx, state: IkState): Promise<MessagePayload> {
  const profile = ctx.store.getProfile(ctx.viewerId);
  if (!profile) return buildSetupMessage(ctx);
  const s = normalize(ctx, state);
  const items = ctx.store.listFeed({ viewerId: ctx.viewerId, main: s.main, sub: s.sub, guildId: ctx.guildId });
  const byId = new Map(items.map((p) => [p.id, p]));
  const result = await renderFeed({
    viewer: { nickname: profile.nickname, avatarId: profile.avatarId, reputation: ctx.store.reputation(ctx.viewerId, { includeAnonymous: true }) },
    mainLabels: MAIN_KEYS.map((k) => ctx.tr(k)),
    subLabels: SUB_KEYS.map((k) => ctx.tr(k)),
    main: MAINS.indexOf(s.main),
    sub: SUBS.indexOf(s.sub),
    disabledMain: ctx.guildId ? [] : [1],
    cards: items.map((p) => ({
      id: p.id,
      title: tagTitle(ctx, p),
      excerpt: p.body.split(/\r?\n/).find((l) => l.trim()) ?? "",
      ...displayAuthor(p, ctx.tr),
      coverPath: p.coverHash ? coverPath(p.coverHash) : null,
      featured: p.featured,
      isNew: isNew(p.createdAt, p.read, ctx.now),
      read: p.read,
    })),
    page: s.page,
    highlightId: s.last,
    featuredLabel: ctx.tr("interknot_Tab_Featured"),
    locale: ctx.locale,
  });
  const cur: IkState = { main: s.main, sub: s.sub, page: result.page };

  const select = new StringSelectMenuBuilder()
    .setCustomId(encodeIkId("sel", cur))
    .setPlaceholder(ctx.tr("interknot_SelectPost"));
  const options = result.visibleIds.map((id) => {
    const p = byId.get(id)!;
    return {
      label: clip(tagTitle(ctx, p), 100),
      description: clip(`${displayAuthor(p, ctx.tr).nickname} · ♥${ctx.store.heartCount(id)}`, 100),
      value: String(id),
    };
  });
  if (options.length) select.addOptions(options);
  else select.addOptions({ label: "—", value: "none" }).setDisabled(true);

  const tabs = MAINS.map((m, n) =>
    button(encodeIkId("tab", { ...cur, main: m, page: 0 }), ctx.tr(MAIN_KEYS[n]), m === s.main ? ButtonStyle.Primary : ButtonStyle.Secondary).setDisabled(
      m === "guild" && !ctx.guildId,
    ),
  );
  const subs = SUBS.map((x, n) =>
    button(encodeIkId("sub", { ...cur, sub: x, page: 0 }), ctx.tr(SUB_KEYS[n]), x === s.sub ? ButtonStyle.Primary : ButtonStyle.Secondary),
  );
  const actions = [
    button(encodeIkId("up", { ...cur, page: cur.page - 1 }), ctx.tr("interknot_Prev")).setEmoji("⬆️").setDisabled(cur.page <= 0),
    button(encodeIkId("down", { ...cur, page: cur.page + 1 }), ctx.tr("interknot_Next"))
      .setEmoji("⬇️")
      .setDisabled(cur.page >= result.totalPages - 1),
    button(encodeIkId("compose", cur), ctx.tr("interknot_Compose"), ButtonStyle.Success).setEmoji("✏️"),
    button(encodeIkId("refresh", cur), ctx.tr("interknot_Refresh")).setEmoji("🔄"),
    button(encodeIkId("profile", cur), ctx.tr("interknot_Profile")).setEmoji("👤"),
  ];
  return payload(
    [new AttachmentBuilder(result.buffer, { name: "interknot.png" })],
    [row(select), row(...tabs), row(...subs), row(...actions)],
  );
}

/** Null when the post is gone, or hidden from this viewer (authors and developers still see hidden posts). */
export async function buildDetailMessage(ctx: ViewCtx, state: IkState): Promise<MessagePayload | null> {
  const s = normalize(ctx, state);
  const post = s.postId === undefined ? null : ctx.store.getPost(s.postId);
  if (!post || post.status === "deleted") return null;
  const isAuthor = post.authorId === ctx.viewerId;
  if (post.status === "hidden" && !isAuthor && !ctx.isDeveloper) return null;
  ctx.store.markRead(ctx.viewerId, post.id, ctx.now);

  const authorProfile = ctx.store.getProfile(post.authorId);
  const author = displayAuthor({ anonymous: post.anonymous, nickname: authorProfile?.nickname ?? "", avatarId: authorProfile?.avatarId ?? 1 }, ctx.tr);
  const hearts = ctx.store.heartCount(post.id);
  const comments = ctx.store.listComments(post.id);
  const result = await renderDetail({
    // An anonymous author's reputation would help identify them, so show this post's hearts instead.
    author: { ...author, reputation: post.anonymous ? hearts : ctx.store.reputation(post.authorId) },
    title: tagTitle(ctx, post),
    body: post.body,
    coverPath: post.coverHash ? coverPath(post.coverHash) : null,
    featured: post.featured,
    featuredLabel: ctx.tr("interknot_Tab_Featured"),
    comments: detailComments(ctx, post, comments),
    expanded: !!s.expanded,
    commentPage: s.cpage ?? 0,
    endLabel: ctx.tr("interknot_End"),
    opLabel: ctx.tr("interknot_Op"),
    locale: ctx.locale,
  });
  const cur: IkState = { ...s, cpage: result.commentPage };

  const nav = [
    button(encodeIkId("cprev", { ...cur, cpage: cur.cpage! - 1 }), ctx.tr("interknot_CommentPrev"))
      .setEmoji("🔼")
      .setDisabled(cur.cpage! <= 0),
    button(encodeIkId("cnext", { ...cur, cpage: cur.cpage! + 1 }), ctx.tr("interknot_CommentNext"))
      .setEmoji("🔽")
      .setDisabled(cur.cpage! >= result.commentPages - 1),
  ];
  if (result.bodyTruncated) nav.unshift(button(encodeIkId("exp", { ...cur, expanded: true }), ctx.tr("interknot_Expand")).setEmoji("📖"));
  const hearted = ctx.store.hasHeart(post.id, ctx.viewerId);
  const rows = [
    row(...nav),
    row(
      button(encodeIkId("cmt", cur), ctx.tr("interknot_Comment"), ButtonStyle.Primary).setEmoji("💬"),
      button(encodeIkId("heart", cur), ctx.tr("interknot_Heart", { n: hearts }), hearted ? ButtonStyle.Danger : ButtonStyle.Secondary),
      button(encodeIkId("rep", cur), ctx.tr("interknot_Report")).setEmoji("⚠️"),
      button(encodeIkId("back", { main: cur.main, sub: cur.sub, page: cur.page, last: post.id }), ctx.tr("interknot_Back")).setEmoji("✖️"),
    ),
  ];
  const owner = [
    ...(isAuthor ? [button(encodeIkId("del", cur), ctx.tr("interknot_Delete"), ButtonStyle.Danger).setEmoji("🗑️")] : []),
    ...(ctx.isDeveloper
      ? [button(encodeIkId(post.featured ? "unfeat" : "feat", cur), ctx.tr(post.featured ? "interknot_Unfeature" : "interknot_Feature")).setEmoji("⭐")]
      : []),
  ];
  if (owner.length) rows.push(row(...owner));
  const mine = comments.filter((c) => c.authorId === ctx.viewerId).slice(-25);
  if (mine.length)
    rows.push(
      row(
        new StringSelectMenuBuilder()
          .setCustomId(encodeIkId("cdel", cur))
          .setPlaceholder(`🗑️ ${ctx.tr("interknot_Delete")}`)
          .addOptions(mine.map((c) => ({ label: clip(`${c.floor} F · ${c.body}`, 100), value: String(c.id) }))),
      ),
    );
  return payload([new AttachmentBuilder(result.buffer, { name: "interknot-post.png" })], rows);
}

/** [樓主] only when the comment and post share anonymity; a mixed pair would link a named identity to an anonymous one. */
export function detailComments(ctx: ViewCtx, post: Pick<Post, "authorId" | "anonymous">, comments: Comment[]): DetailComment[] {
  return comments.map((c) => ({
    floor: c.floor,
    ...displayAuthor(c, ctx.tr),
    body: c.body,
    isOp: c.authorId === post.authorId && c.anonymous === post.anonymous,
  }));
}

/** Floors visible on the viewer's current comment page, offered as report targets. */
export function reportFloors(ctx: ViewCtx, s: IkState): number[] {
  if (s.postId === undefined) return [];
  const comments = ctx.store.listComments(s.postId).map((c) => ({ floor: c.floor, ...displayAuthor(c, ctx.tr), body: c.body, isOp: false }));
  return commentPageFloors(comments, s.cpage ?? 0, ctx.locale);
}

const label = (text: string) => new LabelBuilder().setLabel(text);
const anonymousSelect = (ctx: ViewCtx) =>
  new StringSelectMenuBuilder()
    .setCustomId("anonymous")
    .addOptions(
      { label: ctx.tr("interknot_AnonNo"), value: "no", default: true },
      { label: ctx.tr("interknot_AnonYes"), value: "yes" },
    );

export function postModal(ctx: ViewCtx, s: IkState): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(encodeIkId("mpost", s))
    .setTitle(ctx.tr("interknot_Modal_Post"))
    .addLabelComponents(
      label(ctx.tr("interknot_Field_Tag")).setStringSelectMenuComponent(
        new StringSelectMenuBuilder()
          .setCustomId("tag")
          .addOptions(TAGS.map((t, n) => ({ label: ctx.tr(`interknot_Tag_${t}`), value: t, default: n === 0 }))),
      ),
      label(ctx.tr("interknot_Field_Title")).setTextInputComponent(
        new TextInputBuilder().setCustomId("title").setStyle(TextInputStyle.Short).setMaxLength(LIMITS.title).setRequired(true),
      ),
      label(ctx.tr("interknot_Field_Body")).setTextInputComponent(
        new TextInputBuilder().setCustomId("body").setStyle(TextInputStyle.Paragraph).setMaxLength(LIMITS.body).setRequired(true),
      ),
      label(ctx.tr("interknot_Field_Cover")).setFileUploadComponent(
        new FileUploadBuilder().setCustomId("cover").setRequired(false).setMaxValues(1),
      ),
      label(ctx.tr("interknot_Field_Anonymous")).setStringSelectMenuComponent(anonymousSelect(ctx)),
    );
}

export function commentModal(ctx: ViewCtx, s: IkState): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(encodeIkId("mcmt", s))
    .setTitle(ctx.tr("interknot_Modal_Comment"))
    .addLabelComponents(
      label(ctx.tr("interknot_Field_Content")).setTextInputComponent(
        new TextInputBuilder().setCustomId("body").setStyle(TextInputStyle.Paragraph).setMaxLength(LIMITS.comment).setRequired(true),
      ),
      label(ctx.tr("interknot_Field_Anonymous")).setStringSelectMenuComponent(anonymousSelect(ctx)),
    );
}

export function reportModal(ctx: ViewCtx, s: IkState, visibleFloors: number[]): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(encodeIkId("mrep", s))
    .setTitle(ctx.tr("interknot_Modal_Report"))
    .addLabelComponents(
      label(ctx.tr("interknot_Field_Target")).setStringSelectMenuComponent(
        new StringSelectMenuBuilder()
          .setCustomId("target")
          .addOptions(
            { label: ctx.tr("interknot_Target_Post"), value: "post", default: true },
            ...visibleFloors.slice(0, 24).map((f) => ({ label: ctx.tr("interknot_Target_Floor", { n: f }), value: String(f) })),
          ),
      ),
      label(ctx.tr("interknot_Field_Reason")).setStringSelectMenuComponent(
        new StringSelectMenuBuilder()
          .setCustomId("reason")
          .addOptions(["nsfw", "harass", "spam", "other"].map((r) => ({ label: ctx.tr(`interknot_Reason_${r}`), value: r }))),
      ),
      label(ctx.tr("interknot_Field_Note")).setTextInputComponent(
        new TextInputBuilder().setCustomId("note").setStyle(TextInputStyle.Paragraph).setMaxLength(300).setRequired(false),
      ),
    );
}

export function profileModal(ctx: ViewCtx, current: Profile | null, s: IkState = { main: "all", sub: "all", page: 0 }): ModalBuilder {
  const nickname = new TextInputBuilder()
    .setCustomId("nickname")
    .setStyle(TextInputStyle.Short)
    .setMinLength(LIMITS.nicknameMin)
    .setMaxLength(LIMITS.nicknameMax * 2) // code points are validated server-side; UTF-16 emoji take two units
    .setRequired(true);
  if (current) nickname.setValue(current.nickname);
  return new ModalBuilder()
    .setCustomId(encodeIkId("mprof", s))
    .setTitle(ctx.tr("interknot_Modal_Profile"))
    .addLabelComponents(
      label(ctx.tr("interknot_Field_Nickname")).setTextInputComponent(nickname),
      label(ctx.tr("interknot_Field_Avatar")).setStringSelectMenuComponent(
        new StringSelectMenuBuilder()
          .setCustomId("avatar")
          .addOptions(AVATAR_IDS.map((id) => ({ label: `#${id}`, value: String(id), default: id === (current?.avatarId ?? 1) }))),
      ),
    );
}
