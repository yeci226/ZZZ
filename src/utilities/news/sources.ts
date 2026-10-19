import { newsVideoTitles } from "./video.js";
import { parseArticle } from "./article.js";
import axios from "axios";
import {
  API_LOCALES,
  GAME_CONFIG,
  type NewsCategory,
  type NewsEvent,
  type NewsGame,
  type NewsLocale,
  type UpdateSnapshot,
  type UpdateState,
  type MaintenanceState,
} from "./types.js";

export type JsonObject = Record<string, any>;
export type GetJson = (
  url: string,
  headers?: Record<string, string>,
) => Promise<JsonObject>;
export const getJson: GetJson = async (url, headers = {}) => {
  const response = await axios.get(url, {
    headers,
    timeout: 15_000,
    maxContentLength: 5_000_000,
  });
  if (
    response.data?.retcode !== 0 ||
    !response.data.data ||
    typeof response.data.data !== "object"
  )
    throw new Error("source_invalid_response");
  return response.data.data;
};

export function plainText(html: unknown): string {
  if (typeof html !== "string") return "";
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<(br|\/p|\/div)\b[^>]*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
export function safeUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password
      ? u.href
      : null;
  } catch {
    return null;
  }
}

/** Explicit title families take priority over incidental character names in rewards copy. */
export function classifyArticle(title: string, content = ""): NewsCategory[] {
  const result = new Set<NewsCategory>();
  const activity =
    /活動|活动|抽獎|抽奖|有獎|有奖|徵稿|征稿|討論|讨论|event|giveaway|contest|événement|concours|イベント|キャンペーン|이벤트|sự kiện/iu.test(
      title,
    );
  const reveal =
    /天外[衛卫]星通[訊讯]|代理人[檔档]案|extraterrestrial satellite communication|agent record|drip marketing|天外衛星通信|エージェントファイル|천외 위성 통신|에이전트 파일|communication satellite|dossier.*agent|hồ sơ.*đại diện/iu.test(
      title,
    );
  const preview =
    /前瞻|特[別别][節节]目|版本.*(?:PV|速[覽览]|[預预]告)|special program|version.*(?:trailer|preview)|予告番組|특별 방송|avant-première|chương trình đặc biệt/iu.test(
      title,
    );
  if (activity) result.add("event");
  if (reveal && !activity) result.add("character_reveal");
  if (preview && !activity) result.add("preview");
  if (/維護|维护|maintenance|メンテナンス|점검|bảo trì/iu.test(title))
    result.add("maintenance");
  if (
    /預先下載|预下载|預下載|pre[- ]?(?:download|install|load)|事前ダウンロード|사전 다운로드|pré[- ]téléchargement|tải trước/iu.test(
      title,
    )
  )
    result.add("preload");
  if (
    /更新公[告吿]|更新通知|更新[說说]明|update (?:details|notice|announcement)|version.*update|アップデート詳細|업데이트 안내|mise à jour|thông báo cập nhật/iu.test(
      title,
    )
  )
    result.add("update");
  if (
    /[躍跃][遷迁]|限時頻道|限时频[道段]|獨家頻道|独家频[道段]|流光定影|光錐|光锥|event warp|signal search|exclusive channel|light cone|跳躍|限定変調|워프|독점 채널|saut événement|recherche de signal|bước nhảy sự kiện/iu.test(
      title,
    )
  )
    result.add("banner");
  if (
    !activity &&
    !reveal &&
    !preview &&
    /角色[預预][覽览告]|角色展示|角色介紹|角色介绍|(?:機制|机制)(?:介紹|介绍)|代理人(?:機制|机制|戰鬥|战斗|未[歸归][檔档])|走近星穹|非賣品影像|非卖品影像|character (?:preview|trailer|demo|introduction)|agent (?:mechanics|combat|guide|trailer)|keeping up with star rail|キャラクター(?:紹介|PV)|エージェント.*紹介|캐릭터.*(?:소개|pv)|personnage|présentation.*agent|giới thiệu.*(?:nhân vật|đại diện)|(?:角色|代理人|絕區零|绝区零).*(?:EP|PV)/iu.test(
      title,
    )
  )
    result.add("character");
  // Body is only a fallback. Announcement footers must not reclassify explicit title families.
  if (
    !result.size &&
    /維護|维护|maintenance|メンテナンス|점검|bảo trì/iu.test(
      plainText(content).slice(0, 300),
    )
  )
    result.add("maintenance");
  return result.size ? [...result] : ["other"];
}

export interface ArticlePage {
  events: NewsEvent[];
  ids: string[];
  cursor: string | null;
  last: boolean;
  newestPublishedAt?: number;
}
export class NewsSources {
  private fullCache = new Map<string, Promise<NewsEvent>>();
  constructor(
    readonly game: NewsGame,
    private request: GetJson = getJson,
  ) {}
  private headers(locale: NewsLocale): Record<string, string> {
    return {
      "x-rpc-app_version": "2.43.0",
      "x-rpc-client_type": "4",
      "X-Rpc-Language": API_LOCALES[locale],
    };
  }
  article(raw: JsonObject, locale: NewsLocale): NewsEvent | null {
    const post = raw.post;
    if (!post || String(raw.user?.uid) !== GAME_CONFIG[this.game].officialUid)
      return null;
    if (
      !/^\d+$/.test(String(post.post_id)) ||
      typeof post.subject !== "string" ||
      !Number.isFinite(Number(post.created_at))
    )
      throw new Error("article_invalid_shape");
    const body = typeof post.content === "string" ? post.content : "";
    const cover = [...(raw.image_list ?? []), ...(raw.cover_list ?? [])].find(
      (entry: JsonObject) => safeUrl(entry.url),
    );
    const inline = body.match(/<img[^>]+src=["']([^"']+)/i)?.[1];
    const summary = plainText(body);
    return {
      id: `post:${this.game}:${locale}:${post.post_id}`,
      game: this.game,
      source: "hoyolab",
      locale,
      categories: classifyArticle(post.subject, body),
      publishedAt: Number(post.created_at) * 1000,
      title: post.subject,
      authorName:
        typeof raw.user?.nickname === "string"
          ? raw.user.nickname
          : this.game === "hsr"
            ? "Honkai: Star Rail"
            : "Zenless Zone Zero",
      summary: /^(zh-tw|zh-cn|en-us|ja-jp|ko-kr|fr-fr|vi-vn)$/.test(summary)
        ? ""
        : summary.slice(0, 3000),
      image: safeUrl(cover?.url) ?? safeUrl(inline),
      url: `https://www.hoyolab.com/article/${post.post_id}?lang=${API_LOCALES[locale]}`,
      kind: "article",
      version: null,
    };
  }
  async articles(
    locale: NewsLocale,
    type: number,
    cursor: string | null = null,
  ): Promise<ArticlePage> {
    const url = new URL(
      "https://bbs-api-os.hoyolab.com/community/post/wapi/getNewsList",
    );
    url.search = new URLSearchParams({
      gids: String(GAME_CONFIG[this.game].gids),
      page_size: "25",
      type: String(type),
      ...(cursor ? { last_id: cursor } : {}),
    }).toString();
    const data = await this.request(url.href, this.headers(locale));
    if (!Array.isArray(data.list) || typeof data.is_last !== "boolean")
      throw new Error("article_list_invalid_shape");
    const events: NewsEvent[] = [];
    const ids: string[] = [];
    for (const row of data.list) {
      if (!row?.post?.post_id) throw new Error("article_missing_id");
      ids.push(String(row.post.post_id));
      const article = this.article(row, locale);
      if (article) events.push(article);
    }
    const next =
      data.last_id === undefined || data.last_id === null
        ? null
        : String(data.last_id);
    if (!data.is_last && data.list.length && (!next || next === cursor))
      throw new Error("article_invalid_cursor");
    return {
      events,
      ids,
      cursor: next,
      last: data.is_last || data.list.length === 0,
      newestPublishedAt: Math.max(
        0,
        ...data.list.map(
          (row: JsonObject) => Number(row.post?.created_at) * 1000 || 0,
        ),
      ),
    };
  }
  async fullArticle(event: NewsEvent, locale: NewsLocale): Promise<NewsEvent> {
    const key = `${this.game}:${event.id}:${locale}`;
    let pending = this.fullCache.get(key);
    if (!pending) {
      pending = this.fetchFullArticle(event, locale);
      this.fullCache.set(key, pending);
      if (this.fullCache.size > 256)
        this.fullCache.delete(this.fullCache.keys().next().value!);
      pending.catch(() => this.fullCache.delete(key));
    }
    return pending;
  }
  private async fetchFullArticle(
    event: NewsEvent,
    locale: NewsLocale,
  ): Promise<NewsEvent> {
    const postId = event.id.split(":").pop();
    if (!postId || !/^\d+$/.test(postId)) throw new Error("invalid_post_id");
    const data = await this.request(
      `https://bbs-api-os.hoyolab.com/community/post/wapi/getPostFull?gids=${GAME_CONFIG[this.game].gids}&post_id=${postId}`,
      this.headers(locale),
    );
    const article = this.article(data.post ?? {}, locale);
    if (!article) throw new Error("article_not_official");
    article.article = parseArticle(
      data.post?.post?.structured_content,
      data.post?.post?.content,
      article.image,
    );
    article.article = await newsVideoTitles.enrich(
      article.article,
      article.title,
      locale,
    );
    return article;
  }
  async updates(): Promise<UpdateSnapshot> {
    const data = await this.request(
      "https://sg-hyp-api.hoyoverse.com/hyp/hyp-connect/api/getGameBranches?launcher_id=VYTpXlbWo8",
    );
    const branch = data.game_branches?.find(
      (b: JsonObject) => b.game?.id === GAME_CONFIG[this.game].branchId,
    );
    const main = branch?.main?.tag;
    const preload =
      branch?.pre_download == null ? null : branch.pre_download.tag;
    if (!validVersion(main) || (preload !== null && !validVersion(preload)))
      throw new Error("update_invalid_shape");
    return { main, preload };
  }
  async maintenance(version: string): Promise<boolean> {
    const config = GAME_CONFIG[this.game];
    const data = await this.request(config.maintUrl, {
      "x-rpc-app_version": version,
      "x-rpc-client_type": "1",
      "x-rpc-cg_game_biz": config.maintBiz,
    });
    if (
      !Object.hasOwn(data, "application_maintenance") ||
      (data.application_maintenance !== null &&
        (typeof data.application_maintenance !== "object" ||
          Array.isArray(data.application_maintenance)))
    )
      throw new Error("maintenance_unknown");
    return data.application_maintenance !== null;
  }
}

export function validVersion(v: unknown): v is string {
  return typeof v === "string" && /^\d+\.\d+\.\d+$/.test(v);
}
export function compareVersion(a: string, b: string): number {
  const aa = a.split(".").map(Number),
    bb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = aa[i]! - bb[i]!;
    if (diff) return Math.sign(diff);
  }
  return 0;
}
function statusEvent(
  game: NewsGame,
  kind: NewsEvent["kind"],
  version: string,
  now: number,
  suffix = version,
): NewsEvent {
  const maintenance = kind.startsWith("maintenance");
  return {
    id: `${game}:${kind}:${suffix}`,
    game,
    source: maintenance ? "maintenance" : "hoyoplay",
    locale: null,
    categories: [maintenance ? "maintenance" : (kind as "update" | "preload")],
    publishedAt: now,
    title: "",
    summary: "",
    image: null,
    url: `https://m.hoyolab.com/toBBS.html?game_id=${GAME_CONFIG[game].gids}`,
    kind,
    version,
  };
}
export function evaluateUpdates(
  game: NewsGame,
  old: UpdateState | null,
  snapshot: UpdateSnapshot,
  now: number,
): { state: UpdateState; events: NewsEvent[] } {
  const events: NewsEvent[] = [];
  if (old && compareVersion(snapshot.main, old.main) > 0)
    events.push(statusEvent(game, "update", snapshot.main, now));
  if (
    old &&
    snapshot.preload &&
    compareVersion(snapshot.preload, old.highestPreload ?? old.main) > 0
  )
    events.push(statusEvent(game, "preload", snapshot.preload, now));
  return {
    state: {
      main:
        old && compareVersion(old.main, snapshot.main) > 0
          ? old.main
          : snapshot.main,
      preload: snapshot.preload,
      highestPreload:
        snapshot.preload &&
        (!old?.highestPreload ||
          compareVersion(snapshot.preload, old.highestPreload) > 0)
          ? snapshot.preload
          : (old?.highestPreload ?? null),
    },
    events,
  };
}
export function evaluateMaintenance(
  game: NewsGame,
  old: MaintenanceState | null,
  active: boolean,
  version: string,
  now: number,
): { state: MaintenanceState; events: NewsEvent[] } {
  const cycle = (old?.cycle ?? 0) + (active && !old?.active ? 1 : 0);
  return {
    state: { active, cycle },
    events:
      old && old.active !== active
        ? [
            statusEvent(
              game,
              active ? "maintenance_start" : "maintenance_end",
              version,
              now,
              String(cycle),
            ),
          ]
        : [],
  };
}
