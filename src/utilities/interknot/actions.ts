import {
  MessageFlags,
  type ButtonInteraction,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
} from "discord.js";

import { isDeveloper } from "../contactDev.js";
import { createTranslator } from "../core/i18n.js";
import { CoverError, downloadCover, removeCoverIfUnused, storeCover } from "./covers.js";
import { decodeIkId, type IkState } from "./customId.js";
import {
  checkCommentRate,
  checkPostRate,
  NEW_WINDOW_MS,
  PERMANENT_BAN,
  shouldHide,
  validateComment,
  validateNickname,
  validatePost,
  type RateResult,
  type Tag,
} from "./rules.js";
import { AVATAR_IDS } from "./setupRenderer.js";
import type { InterknotStore, Profile } from "./store.js";
import {
  buildDetailMessage,
  buildFeedMessage,
  commentModal,
  postModal,
  profileModal,
  reportFloors,
  reportModal,
  type ViewCtx,
} from "./views.js";

export interface Notifier {
  newPost(postId: number): Promise<void>;
  autoHidden(type: "post" | "comment", id: number, reporters: number): Promise<void>;
}

export type Result = { ok: true; postId?: number } | { ok: false; error: string; params?: Record<string, string> };

const fail = (error: string, params?: Record<string, string>): Result => (params ? { ok: false, error, params } : { ok: false, error });
const when = (ms: number) => (ms >= PERMANENT_BAN ? "∞" : `<t:${Math.ceil(ms / 1000)}:R>`);

/** Profile and ban gate shared by every write a user makes. */
function gate(store: InterknotStore, userId: string, now: number): Profile | Result {
  const profile = store.getProfile(userId);
  if (!profile) return fail("interknot_NoProfile");
  if (profile.bannedUntil && profile.bannedUntil > now) return fail("interknot_Banned", { time: when(profile.bannedUntil) });
  return profile;
}
const isResult = (v: Profile | Result): v is Result => "ok" in v;
const rateFail = (r: RateResult): Result | null => (r.ok ? null : fail("interknot_RateLimited", { time: when(r.retryAt) }));
const visiblePost = (store: InterknotStore, id: number) => {
  const post = store.getPost(id);
  return post?.status === "visible" ? post : null;
};

export async function submitPost(
  store: InterknotStore,
  notifier: Notifier,
  i: { userId: string; guildId: string | null; tag: string; title: string; body: string; anonymous: boolean; cover: Buffer | null },
  now: number,
  coverDir?: string,
): Promise<Result> {
  const g = gate(store, i.userId, now);
  if (isResult(g)) return g;
  const limited = rateFail(checkPostRate(store.recentPostTimes(i.userId, now - NEW_WINDOW_MS), now));
  if (limited) return limited;
  const [invalid] = validatePost(i);
  if (invalid) return fail(invalid);

  let coverHash: string | null = null;
  if (i.cover) {
    try {
      coverHash = await storeCover(i.cover, coverDir);
    } catch (error) {
      if (error instanceof CoverError) return fail(`interknot_Cover_${error.reason}`);
      throw error;
    }
  }
  let postId: number;
  try {
    postId = store.createPost(
      { authorId: i.userId, guildId: i.guildId, tag: i.tag as Tag, title: i.title.trim(), body: i.body.trim(), coverHash, anonymous: i.anonymous },
      now,
    );
  } catch (error) {
    if (coverHash) await removeCoverIfUnused(coverHash, store.coverRefCount(coverHash), coverDir);
    throw error;
  }
  await notifier.newPost(postId).catch(() => console.warn("[interknot] notify failed"));
  return { ok: true, postId };
}

export function submitComment(
  store: InterknotStore,
  i: { userId: string; postId: number; body: string; anonymous: boolean },
  now: number,
): Result {
  const g = gate(store, i.userId, now);
  if (isResult(g)) return g;
  if (!visiblePost(store, i.postId)) return fail("interknot_NotFound");
  const limited = rateFail(checkCommentRate(store.lastCommentAt(i.userId), now));
  if (limited) return limited;
  const [invalid] = validateComment(i.body);
  if (invalid) return fail(invalid);
  store.addComment(i.postId, i.userId, i.body.trim(), i.anonymous, now);
  return { ok: true };
}

export function toggleHeartAction(store: InterknotStore, userId: string, postId: number, now: number): Result {
  const g = gate(store, userId, now);
  if (isResult(g)) return g;
  const post = visiblePost(store, postId);
  if (!post) return fail("interknot_NotFound");
  if (post.authorId === userId) return fail("interknot_SelfHeart");
  store.toggleHeart(postId, userId, now);
  return { ok: true };
}

export async function submitReport(
  store: InterknotStore,
  notifier: Notifier,
  i: { userId: string; type: "post" | "comment"; targetId: number; reason: string; note: string },
  now: number,
): Promise<Result> {
  const comment = i.type === "comment" ? store.getComment(i.targetId) : null;
  const visible =
    i.type === "post"
      ? !!visiblePost(store, i.targetId)
      : comment?.status === "visible" && !!visiblePost(store, comment.postId);
  if (!visible) return fail("interknot_NotFound");
  const reporters = store.addReport(i.type, i.targetId, i.userId, i.reason, i.note.trim(), now);
  if (shouldHide(reporters)) {
    if (i.type === "post") store.setPostStatus(i.targetId, "hidden");
    else store.setCommentStatus(i.targetId, "hidden");
    await notifier.autoHidden(i.type, i.targetId, reporters).catch(() => console.warn("[interknot] notify failed"));
  }
  return { ok: true };
}

export async function deleteOwn(
  store: InterknotStore,
  userId: string,
  type: "post" | "comment",
  id: number,
  coverDir?: string,
): Promise<Result> {
  if (type === "comment") {
    const comment = store.getComment(id);
    if (!comment || comment.authorId !== userId || comment.status === "deleted") return fail("interknot_NotFound");
    store.setCommentStatus(id, "deleted");
    return { ok: true };
  }
  const post = store.getPost(id);
  if (!post || post.authorId !== userId || post.status === "deleted") return fail("interknot_NotFound");
  store.setPostStatus(id, "deleted");
  if (post.coverHash) await removeCoverIfUnused(post.coverHash, store.coverRefCount(post.coverHash), coverDir);
  return { ok: true };
}

export function setFeaturedAction(store: InterknotStore, userId: string, postId: number, on: boolean, isDev: boolean): Result {
  if (!isDev) return fail("interknot_NotDeveloper");
  if (!visiblePost(store, postId)) return fail("interknot_NotFound");
  store.setFeatured(postId, on);
  return { ok: true };
}

export function saveProfileAction(store: InterknotStore, userId: string, nickname: string, avatarId: number, now: number): Result {
  const name = nickname.trim();
  const invalid = validateNickname(name);
  if (invalid) return fail(invalid);
  if (!AVATAR_IDS.includes(avatarId)) return fail("interknot_Failed");
  return store.saveProfile(userId, name, avatarId, now) === "ok" ? { ok: true } : fail("interknot_NicknameTaken");
}

type IkInteraction = ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction;

/** Routes every `ik:` button, select and modal (moderation buttons are handled in moderation.ts). */
export async function handleInterknotInteraction(
  interaction: IkInteraction,
  deps: { store: InterknotStore; notifier: Notifier; locale: string },
): Promise<unknown> {
  const parsed = decodeIkId(interaction.customId);
  if (!parsed) return;
  const { action, state } = parsed;
  const { store, notifier } = deps;
  const { locale } = deps;
  const tr = createTranslator(locale) as ViewCtx["tr"];
  const userId = interaction.user.id;
  const ctx: ViewCtx = {
    store,
    viewerId: userId,
    guildId: interaction.guildId,
    isDeveloper: isDeveloper(userId),
    locale,
    tr,
    now: Date.now(),
  };
  const tell = (r: Result | string) => {
    const content = typeof r === "string" ? tr(r) : r.ok ? "" : tr(r.error, r.params);
    return content ? interaction.followUp({ content, flags: MessageFlags.Ephemeral }).catch(() => {}) : undefined;
  };
  const showFeed = async (s: IkState) => interaction.editReply(await buildFeedMessage(ctx, s));
  const showDetail = async (s: IkState) => {
    const detail = await buildDetailMessage(ctx, s);
    if (detail) return interaction.editReply(detail);
    await showFeed({ main: s.main, sub: s.sub, page: s.page });
    await tell("interknot_NotFound");
  };

  // Modals must be the first response, so these run before any defer.
  if (interaction.isButton()) {
    if (action === "setup" || action === "profile") return interaction.showModal(profileModal(ctx, store.getProfile(userId), state));
    if (action === "cmt") return interaction.showModal(commentModal(ctx, state));
    if (action === "rep") return interaction.showModal(reportModal(ctx, state, reportFloors(ctx, state)));
    if (action === "compose") {
      const g = gate(store, userId, ctx.now);
      const blocked = isResult(g) ? g : rateFail(checkPostRate(store.recentPostTimes(userId, ctx.now - NEW_WINDOW_MS), ctx.now));
      if (blocked && !blocked.ok)
        return interaction.reply({ content: tr(blocked.error, blocked.params), flags: MessageFlags.Ephemeral });
      return interaction.showModal(postModal(ctx, state));
    }
  }

  await interaction.deferUpdate();

  if (interaction.isModalSubmit()) {
    const f = interaction.fields;
    const anonymous = () => f.getStringSelectValues("anonymous")[0] === "yes";
    if (action === "mprof") {
      const r = saveProfileAction(store, userId, f.getTextInputValue("nickname"), Number(f.getStringSelectValues("avatar")[0]), ctx.now);
      if (!r.ok) return tell(r);
      await showFeed(state);
      return tell("interknot_ProfileSaved");
    }
    if (action === "mpost") {
      let cover: Buffer | null = null;
      const file = f.getUploadedFiles("cover", false)?.first();
      if (file) {
        try {
          cover = await downloadCover({ url: file.url, contentType: file.contentType, size: file.size });
        } catch (error) {
          return tell(error instanceof CoverError ? `interknot_Cover_${error.reason}` : "interknot_Failed");
        }
      }
      const r = await submitPost(
        store,
        notifier,
        {
          userId,
          guildId: interaction.guildId,
          tag: f.getStringSelectValues("tag")[0] ?? "",
          title: f.getTextInputValue("title"),
          body: f.getTextInputValue("body"),
          anonymous: anonymous(),
          cover,
        },
        ctx.now,
      );
      if (!r.ok) return tell(r);
      await showFeed({ main: state.main, sub: state.sub, page: 0, last: r.postId });
      return tell("interknot_Posted");
    }
    if (action === "mcmt") {
      const r = submitComment(store, { userId, postId: state.postId ?? -1, body: f.getTextInputValue("body"), anonymous: anonymous() }, ctx.now);
      if (!r.ok) return tell(r);
      // Jump to the last comment page so the new comment is in view (the renderer clamps the page).
      await showDetail({ ...state, cpage: 9999 });
      return tell("interknot_Commented");
    }
    if (action === "mrep") {
      const target = f.getStringSelectValues("target")[0] ?? "post";
      const comment = target === "post" ? null : store.listComments(state.postId ?? -1).find((c) => c.floor === Number(target));
      if (target !== "post" && !comment) return tell("interknot_NotFound");
      const r = await submitReport(
        store,
        notifier,
        {
          userId,
          type: comment ? "comment" : "post",
          targetId: comment ? comment.id : (state.postId ?? -1),
          reason: f.getStringSelectValues("reason")[0] ?? "other",
          note: f.getTextInputValue("note") ?? "",
        },
        ctx.now,
      );
      if (!r.ok) return tell(r);
      await showDetail(state);
      return tell("interknot_Reported");
    }
    return;
  }

  if (interaction.isStringSelectMenu()) {
    const value = Number(interaction.values[0]);
    if (action === "sel") return showDetail({ ...state, postId: value, cpage: 0, expanded: false });
    if (action === "cdel") {
      const r = await deleteOwn(store, userId, "comment", value);
      if (!r.ok) return tell(r);
      await showDetail(state);
      return tell("interknot_Deleted");
    }
    return;
  }

  switch (action) {
    case "tab":
    case "sub":
    case "up":
    case "down":
    case "refresh":
    case "back":
      return showFeed(state);
    case "exp":
    case "cprev":
    case "cnext":
      return showDetail(state);
    case "heart": {
      const r = toggleHeartAction(store, userId, state.postId ?? -1, ctx.now);
      await showDetail(state);
      return tell(r);
    }
    case "feat":
    case "unfeat": {
      const r = setFeaturedAction(store, userId, state.postId ?? -1, action === "feat", ctx.isDeveloper);
      await showDetail(state);
      return tell(r);
    }
    case "del": {
      const r = await deleteOwn(store, userId, "post", state.postId ?? -1);
      if (!r.ok) return tell(r);
      await showFeed({ main: state.main, sub: state.sub, page: state.page });
      return tell("interknot_Deleted");
    }
  }
}
