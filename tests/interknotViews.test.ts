import { ButtonStyle } from "discord.js";

import { createTranslator } from "../src/utilities/core/i18n.js";
import type { IkState } from "../src/utilities/interknot/customId.js";
import { InterknotStore } from "../src/utilities/interknot/store.js";
import {
  buildDetailMessage,
  buildFeedMessage,
  buildSetupMessage,
  detailComments,
  displayAuthor,
  postModal,
  reportModal,
  type ViewCtx,
} from "../src/utilities/interknot/views.js";

const t = 1_800_000_000_000;
const tr = createTranslator("tw") as (k: string, o?: any) => string;
const s: IkState = { main: "all", sub: "all", page: 0 };

type Json = { custom_id?: string; label?: string; style?: number; disabled?: boolean; options?: any[]; components?: Json[]; component?: Json };
const flat = (rows: Json[]): Json[] =>
  rows.flatMap((r) => [r, ...flat([...(r.components ?? []), ...(r.component ? [r.component] : [])])]);
const ids = (rows: Json[]) => flat(rows).flatMap((c) => (c.custom_id ? [c.custom_id] : []));
const byLabel = (rows: Json[], key: string, o?: any) => flat(rows).find((c) => c.label === tr(key, o));
const labels = (rows: Json[]) => flat(rows).flatMap((c) => (c.label ? [c.label] : []));
const json = (p: { components: { toJSON(): unknown }[] }) => p.components.map((r) => r.toJSON() as Json);

let store: InterknotStore;
let ctx: ViewCtx;
let post: number;
let anon: number;
let hidden: number;
beforeEach(() => {
  store = new InterknotStore(":memory:");
  store.saveProfile("author", "RealName", 2, t);
  store.saveProfile("viewer", "Viewer", 3, t);
  store.saveProfile("dev", "Dev", 4, t);
  const base = { authorId: "author", guildId: "g1", tag: "灌水" as const, title: "標題", body: "內文", coverHash: null, anonymous: false };
  post = store.createPost(base, t);
  anon = store.createPost({ ...base, anonymous: true, title: "匿名文" }, t + 1);
  hidden = store.createPost({ ...base, title: "隱藏" }, t + 2);
  store.setPostStatus(hidden, "hidden");
  ctx = { store, viewerId: "viewer", guildId: null, isDeveloper: false, locale: "tw", tr, now: t + 10 };
});

describe("feed message", () => {
  it("has four rows of ik: components within Discord limits", async () => {
    const rows = json(await buildFeedMessage(ctx, s));
    expect(rows).toHaveLength(4);
    expect(ids(rows).every((id) => id.startsWith("ik:") && id.length <= 100)).toBe(true);
    expect(new Set(ids(rows)).size).toBe(ids(rows).length);
  });

  it("disables the server tab in DMs and highlights the current tab", async () => {
    const rows = json(await buildFeedMessage(ctx, s));
    expect(byLabel(rows, "interknot_Tab_Guild")!.disabled).toBe(true);
    expect(byLabel(rows, "interknot_Tab_Push")!.style).toBe(ButtonStyle.Primary);
    expect(byLabel(rows, "interknot_Tab_Mine")!.style).toBe(ButtonStyle.Secondary);
  });

  it("never leaks the real name of anonymous authors", async () => {
    const payload = await buildFeedMessage(ctx, s);
    const text = JSON.stringify(json(payload));
    expect(text).toContain(tr("interknot_Anonymous"));
    expect(text.match(/RealName/g)).toHaveLength(1); // only the non-anonymous post
    expect(payload.files).toHaveLength(1);
  });

  it("shows the setup screen when the viewer has no profile", async () => {
    const payload = await buildFeedMessage({ ...ctx, viewerId: "nobody" }, s);
    expect(labels(json(payload))).toContain(tr("interknot_CreateAccount"));
  });

  it("setup message offers profile creation", async () => {
    const payload = await buildSetupMessage(ctx);
    expect(payload.content).toBe(tr("interknot_SetupIntro"));
    expect(ids(json(payload))).toHaveLength(1);
  });
});

describe("detail message", () => {
  const as = (viewerId: string, isDeveloper = false) =>
    buildDetailMessage({ ...ctx, viewerId, isDeveloper }, { ...s, postId: post });

  it("shows delete only to the author and feature only to developers", async () => {
    expect(labels(json((await as("author"))!))).toContain(tr("interknot_Delete"));
    expect(labels(json((await as("viewer"))!))).not.toContain(tr("interknot_Delete"));
    expect(labels(json((await as("dev", true))!))).toContain(tr("interknot_Feature"));
    expect(labels(json((await as("viewer"))!))).not.toContain(tr("interknot_Feature"));
  });

  it("returns null for hidden posts except to the author and developers", async () => {
    expect(await buildDetailMessage(ctx, { ...s, postId: hidden })).toBeNull();
    expect(await buildDetailMessage({ ...ctx, viewerId: "author" }, { ...s, postId: hidden })).not.toBeNull();
    expect(await buildDetailMessage(ctx, { ...s, postId: 9999 })).toBeNull();
  });

  it("marks the post as read and shows the heart count", async () => {
    store.toggleHeart(post, "dev", t);
    const rows = json((await as("viewer"))!);
    expect(byLabel(rows, "interknot_Heart", { n: 1 })).toBeDefined();
    expect(store.listFeed({ viewerId: "viewer", main: "all", sub: "all", guildId: null }).find((p) => p.id === post)!.read).toBe(true);
  });

  it("lets commenters delete their own comments", async () => {
    store.addComment(post, "viewer", "我的留言", false, t);
    const rows = json((await as("viewer"))!);
    expect(ids(rows).some((id) => id.startsWith("ik:cdel:"))).toBe(true);
    expect(ids(json((await as("dev"))!)).some((id) => id.startsWith("ik:cdel:"))).toBe(false);
  });

  it("keeps anonymous authors anonymous", async () => {
    const payload = (await buildDetailMessage(ctx, { ...s, postId: anon }))!;
    expect(JSON.stringify(json(payload))).not.toContain("RealName");
  });
});

describe("modals", () => {
  it("post modal has five labelled fields", () => {
    expect((postModal(ctx, s).toJSON() as Json).components).toHaveLength(5);
  });

  it("report modal targets the post and the given floors", () => {
    const modal = reportModal(ctx, { ...s, postId: post }, [1, 2]).toJSON() as Json;
    const target = flat(modal.components!).find((c) => c.custom_id === "target")!;
    expect(target.options!.map((o) => o.value)).toEqual(["post", "1", "2"]);
  });

  it("displayAuthor hides anonymous identity", () => {
    expect(displayAuthor({ anonymous: true, nickname: "RealName", avatarId: 5 }, tr)).toEqual({ nickname: tr("interknot_Anonymous"), avatarId: 1 });
    expect(displayAuthor({ anonymous: false, nickname: "RealName", avatarId: 5 }, tr)).toEqual({ nickname: "RealName", avatarId: 5 });
  });
});

describe("OP tag anonymity", () => {
  const post = (anonymous: boolean) => ({ authorId: "author", anonymous });
  const comment = (authorId: string, anonymous: boolean) =>
    ({ id: 1, postId: 1, authorId, floor: 1, body: "x", anonymous, status: "visible" as const, createdAt: t, nickname: "RealName", avatarId: 2 });
  it("tags the OP only when the comment and post share the same anonymity", () => {
    expect(detailComments(ctx, post(false), [comment("author", false)])[0].isOp).toBe(true);
    expect(detailComments(ctx, post(true), [comment("author", true)])[0].isOp).toBe(true);
    // Either mix would link a named identity to an anonymous one.
    expect(detailComments(ctx, post(true), [comment("author", false)])[0].isOp).toBe(false);
    expect(detailComments(ctx, post(false), [comment("author", true)])[0].isOp).toBe(false);
    expect(detailComments(ctx, post(false), [comment("other", false)])[0].isOp).toBe(false);
  });
});
