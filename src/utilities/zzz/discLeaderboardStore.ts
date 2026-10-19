import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  SCORE_VERSION,
  scoreCharacter,
  type ScoringSnapshot,
} from "./combat/scoring.js";
import { getScoringStore } from "./combat/scoringStore.js";
import { resolveCharacterPortrait } from "./characterPortrait.js";
import {
  countEffectiveRolls,
  getCharacterEffectiveSystemIds,
} from "./profileRolls.js";

export interface DiscEnrollment {
  ownerId: string;
  requesterId: string;
  uid: string;
  guildId?: string | null;
  playerName: string;
  avatarSource?: string;
  character: any;
  requestedAt: number;
  requestId: string;
}
export interface RankedDiscEntry {
  ownerId: string;
  uid: string;
  characterId: string;
  playerName: string;
  avatarSource?: string;
  portraitSource: string | null;
  skinName: string | null;
  total: number;
  grade: string;
  updatedAt: number;
  rank: number;
  effectiveRolls: number | null;
  portraitColor: string | null;
}
type StoredEntry = {
  uid: string;
  character_id: string;
  raw_json: string;
  request_id: string;
  requested_at: number;
};
type ActiveScoring = { snapshot: ScoringSnapshot; version: string };

/** Retain only scoring and ranking display data; never persist an SDK/client/account. */
export function scoringInput(character: any) {
  const stat = (p: any) =>
    p && {
      property_id: p.property_id,
      id: p.id,
      system_id: p.system_id,
      base: p.base,
      value: p.value,
    };
  const discs = Array.isArray(character.equip) ? character.equip : [];
  const effectiveIds = getCharacterEffectiveSystemIds(character, discs);
  const hasRolls =
    effectiveIds.size > 0 ||
    discs.some((disc: any) =>
      disc?.properties?.some((p: any) => typeof p?.valid === "boolean"),
    );
  const rolls = hasRolls
    ? discs.reduce(
        (sum: number, disc: any) =>
          sum + countEffectiveRolls(disc, effectiveIds),
        0,
      )
    : character.equip_plan_info?.valid_property_cnt;
  return {
    id: character.id,
    element_type: character.element_type,
    effectiveRolls:
      Number.isInteger(rolls) && rolls >= 0 && rolls <= 54
        ? (rolls as number)
        : null,
    equip: Array.isArray(character.equip)
      ? character.equip.map(
          (d: any) =>
            d && {
              equipment_type: d.equipment_type,
              rarity: d.rarity,
              level: d.level,
              main_properties: Array.isArray(d.main_properties)
                ? d.main_properties.map(stat)
                : undefined,
              properties: Array.isArray(d.properties)
                ? d.properties.map(stat)
                : undefined,
            },
        )
      : null,
  };
}
function result(raw: unknown, snapshot: ScoringSnapshot) {
  try {
    const score = scoreCharacter(raw, snapshot);
    return score?.complete && score.total !== null
      ? { total: Math.round(score.total * 10), grade: score.grade }
      : { total: null, grade: null };
  } catch {
    return { total: null, grade: null };
  }
}

export class DiscLeaderboardStore {
  private db: Database.Database;
  private rebuilding?: Promise<void>;
  constructor(
    filename = resolve("data/zzz-disc-leaderboard.sqlite"),
    seed = getScoringStore().snapshot(),
  ) {
    if (filename !== ":memory:")
      mkdirSync(dirname(filename), { recursive: true });
    this.db = new Database(filename);
    this.db.pragma("busy_timeout = 5000");
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS disc_meta (key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS disc_preferences (owner_id TEXT PRIMARY KEY,enabled INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS disc_accounts (uid TEXT PRIMARY KEY,owner_id TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS disc_unlinked (owner_id TEXT NOT NULL,uid TEXT NOT NULL,at INTEGER NOT NULL,PRIMARY KEY(owner_id,uid));
      CREATE TABLE IF NOT EXISTS disc_entries (
        uid TEXT NOT NULL REFERENCES disc_accounts(uid) ON DELETE CASCADE,character_id TEXT NOT NULL,
        player_name TEXT NOT NULL,avatar_source TEXT,portrait_source TEXT,skin_name TEXT,
        raw_json TEXT NOT NULL,requested_at INTEGER NOT NULL,request_id TEXT NOT NULL,
        updated_at INTEGER NOT NULL,total INTEGER,grade TEXT,PRIMARY KEY(uid,character_id)
      );
      CREATE TABLE IF NOT EXISTS disc_guilds (
        uid TEXT NOT NULL,character_id TEXT NOT NULL,guild_id TEXT NOT NULL,
        PRIMARY KEY(uid,character_id,guild_id),
        FOREIGN KEY(uid,character_id) REFERENCES disc_entries(uid,character_id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS disc_profile_sync (
        uid TEXT PRIMARY KEY REFERENCES disc_accounts(uid) ON DELETE CASCADE,
        token TEXT NOT NULL,expires_at INTEGER NOT NULL,cooldown_until INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS disc_profile_guilds (
        uid TEXT NOT NULL REFERENCES disc_accounts(uid) ON DELETE CASCADE,
        guild_id TEXT NOT NULL,PRIMARY KEY(uid,guild_id)
      );
      CREATE INDEX IF NOT EXISTS disc_rank ON disc_entries(character_id,total DESC);
      CREATE INDEX IF NOT EXISTS disc_account_owner ON disc_accounts(owner_id);
      CREATE INDEX IF NOT EXISTS disc_server ON disc_guilds(guild_id,character_id);
    `);
    this.db
      .prepare("INSERT OR IGNORE INTO disc_meta VALUES('active',?)")
      .run(JSON.stringify({ snapshot: seed, version: SCORE_VERSION }));
  }
  close() {
    this.db.close();
  }
  private active(): ActiveScoring {
    return JSON.parse(
      (
        this.db
          .prepare("SELECT value FROM disc_meta WHERE key='active'")
          .get() as any
      ).value,
    );
  }
  enabled(ownerId: string): boolean {
    return (
      (
        this.db
          .prepare("SELECT enabled FROM disc_preferences WHERE owner_id=?")
          .get(ownerId) as any
      )?.enabled !== 0
    );
  }
  setEnabled(ownerId: string, enabled: boolean): void {
    this.db
      .prepare(
        "INSERT INTO disc_preferences VALUES(?,?) ON CONFLICT(owner_id) DO UPDATE SET enabled=excluded.enabled",
      )
      .run(ownerId, Number(enabled));
    if (!enabled)
      this.db
        .prepare(
          "DELETE FROM disc_profile_sync WHERE uid IN (SELECT uid FROM disc_accounts WHERE owner_id=?)",
        )
        .run(ownerId);
  }
  unlink(ownerId: string, uid: string, at = Date.now()): void {
    this.db
      .transaction(() => {
        this.db
          .prepare(
            "INSERT INTO disc_unlinked VALUES(?,?,?) ON CONFLICT(owner_id,uid) DO UPDATE SET at=MAX(at,excluded.at)",
          )
          .run(ownerId, uid, at);
        this.db
          .prepare("DELETE FROM disc_accounts WHERE uid=? AND owner_id=?")
          .run(uid, ownerId);
      })
      .immediate();
  }
  /** Cross-worker lease; a crash expires naturally. A full profile also enrolls future results in its server. */
  beginProfileSync(
    input: Omit<DiscEnrollment, "character" | "playerName" | "avatarSource">,
    now = Date.now(),
  ) {
    if (input.ownerId !== input.requesterId) return "other-owner" as const;
    if (
      !/^\d+$/.test(input.uid) ||
      !/^\d+$/.test(input.ownerId) ||
      !/^\d{1,20}$/.test(input.requestId) ||
      !Number.isSafeInteger(input.requestedAt)
    )
      throw new Error("Invalid leaderboard identity");
    return this.db
      .transaction(() => {
        if (!this.enabled(input.ownerId)) return "hidden" as const;
        const tombstone = this.db
          .prepare("SELECT at FROM disc_unlinked WHERE owner_id=? AND uid=?")
          .get(input.ownerId, input.uid) as any;
        if (tombstone && input.requestedAt <= tombstone.at)
          return "stale" as const;
        this.db
          .prepare("INSERT OR IGNORE INTO disc_accounts VALUES(?,?)")
          .run(input.uid, input.ownerId);
        if (
          (
            this.db
              .prepare("SELECT owner_id FROM disc_accounts WHERE uid=?")
              .get(input.uid) as any
          ).owner_id !== input.ownerId
        )
          return "other-owner" as const;
        if (input.guildId) {
          this.db
            .prepare("INSERT OR IGNORE INTO disc_profile_guilds VALUES(?,?)")
            .run(input.uid, input.guildId);
          this.db
            .prepare(
              "INSERT OR IGNORE INTO disc_guilds SELECT uid,character_id,? FROM disc_entries WHERE uid=?",
            )
            .run(input.guildId, input.uid);
        }
        const job = this.db
          .prepare(
            "SELECT expires_at,cooldown_until FROM disc_profile_sync WHERE uid=?",
          )
          .get(input.uid) as any;
        if (job?.expires_at > now) return "busy" as const;
        if (job?.cooldown_until > now)
          return job.expires_at === 0 ? ("recent" as const) : ("busy" as const);
        this.db
          .prepare(
            `INSERT INTO disc_profile_sync VALUES(?,?,?,0) ON CONFLICT(uid) DO UPDATE SET token=excluded.token,expires_at=excluded.expires_at,cooldown_until=0`,
          )
          .run(input.uid, input.requestId, now + 180_000);
        return "started" as const;
      })
      .immediate();
  }
  profileSyncActive(uid: string, token: string, now = Date.now()): boolean {
    return Boolean(
      this.db
        .prepare(
          `SELECT 1 FROM disc_profile_sync s JOIN disc_accounts a USING(uid)
      LEFT JOIN disc_preferences p ON p.owner_id=a.owner_id
      WHERE uid=? AND token=? AND expires_at>? AND COALESCE(p.enabled,1)=1`,
        )
        .get(uid, token, now),
    );
  }
  finishProfileSync(
    uid: string,
    token: string,
    complete: boolean,
    now = Date.now(),
  ): void {
    this.db
      .prepare(
        "UPDATE disc_profile_sync SET expires_at=?,cooldown_until=? WHERE uid=? AND token=?",
      )
      .run(complete ? 0 : -1, now + (complete ? 60_000 : 15_000), uid, token);
  }
  record(
    input: DiscEnrollment,
  ): "recorded" | "hidden" | "other-owner" | "stale" {
    if (input.requesterId !== input.ownerId) return "other-owner";
    if (
      !/^\d+$/.test(input.uid) ||
      !/^\d+$/.test(input.ownerId) ||
      !/^\d{1,20}$/.test(input.requestId) ||
      !/^\d{4}$/.test(String(input.character?.id)) ||
      !Number.isSafeInteger(input.requestedAt)
    )
      throw new Error("Invalid leaderboard identity");
    return this.db
      .transaction(() => {
        if (!this.enabled(input.ownerId)) return "hidden" as const;
        const tombstone = this.db
          .prepare("SELECT at FROM disc_unlinked WHERE owner_id=? AND uid=?")
          .get(input.ownerId, input.uid) as any;
        if (tombstone && input.requestedAt <= tombstone.at)
          return "stale" as const;
        this.db
          .prepare("INSERT OR IGNORE INTO disc_accounts VALUES(?,?)")
          .run(input.uid, input.ownerId);
        const account = this.db
          .prepare("SELECT owner_id FROM disc_accounts WHERE uid=?")
          .get(input.uid) as any;
        if (account.owner_id !== input.ownerId) return "other-owner" as const;
        const id = String(input.character.id);
        const previous = this.db
          .prepare(
            "SELECT requested_at,request_id,raw_json,portrait_source,skin_name FROM disc_entries WHERE uid=? AND character_id=?",
          )
          .get(input.uid, id) as any;
        const stale =
          previous &&
          (previous.requested_at > input.requestedAt ||
            (previous.requested_at === input.requestedAt &&
              BigInt(previous.request_id) >= BigInt(input.requestId)));
        if (!stale) {
          const appearance = resolveCharacterPortrait(input.character),
            raw = {
              ...scoringInput(input.character),
              portraitColor: appearance.color,
            },
            score = result(raw, this.active().snapshot);
          // Batch responses can omit roll metadata. Keep a known count only for the exact same gear.
          if (previous) {
            const old = JSON.parse(previous.raw_json);
            if (
              raw.effectiveRolls === null &&
              JSON.stringify(raw.equip) === JSON.stringify(old.equip)
            )
              raw.effectiveRolls = old.effectiveRolls ?? null;
            if (
              appearance.source === previous.portrait_source &&
              !input.character.skin_list?.length
            ) {
              appearance.skinName ??= previous.skin_name;
              raw.portraitColor ??= old.portraitColor ?? null;
            }
          }
          this.db
            .prepare(
              `INSERT INTO disc_entries VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
          ON CONFLICT(uid,character_id) DO UPDATE SET player_name=excluded.player_name,avatar_source=excluded.avatar_source,
          portrait_source=excluded.portrait_source,skin_name=excluded.skin_name,raw_json=excluded.raw_json,
          requested_at=excluded.requested_at,request_id=excluded.request_id,updated_at=excluded.updated_at,total=excluded.total,grade=excluded.grade`,
            )
            .run(
              input.uid,
              id,
              input.playerName.slice(0, 100),
              input.avatarSource ?? null,
              appearance.source,
              appearance.skinName,
              JSON.stringify(raw),
              input.requestedAt,
              input.requestId,
              Date.now(),
              score.total,
              score.grade,
            );
        }
        if (input.guildId)
          this.db
            .prepare("INSERT OR IGNORE INTO disc_guilds VALUES(?,?,?)")
            .run(input.uid, id, input.guildId);
        this.db
          .prepare(
            "INSERT OR IGNORE INTO disc_guilds SELECT uid,?,guild_id FROM disc_profile_guilds WHERE uid=?",
          )
          .run(id, input.uid);
        return stale ? ("stale" as const) : ("recorded" as const);
      })
      .immediate();
  }
  page(
    characterId: string,
    viewerId: string,
    guildId: string | null = null,
    requestedPage = 1,
  ) {
    const cte = `WITH candidates AS (
      SELECT e.*,a.owner_id,ROW_NUMBER() OVER(PARTITION BY a.owner_id ORDER BY e.total DESC,e.updated_at DESC,e.uid) AS seat
      FROM disc_entries e JOIN disc_accounts a USING(uid) LEFT JOIN disc_preferences p ON p.owner_id=a.owner_id
      WHERE e.character_id=@character AND e.total IS NOT NULL AND COALESCE(p.enabled,1)=1
      AND (@guild IS NULL OR EXISTS(SELECT 1 FROM disc_guilds g WHERE g.uid=e.uid AND g.character_id=e.character_id AND g.guild_id=@guild))
    ), ranked AS (SELECT *,RANK() OVER(ORDER BY total DESC) AS rank FROM candidates WHERE seat=1)`;
    return this.db.transaction(() => {
      const args = { character: characterId, guild: guildId };
      const count = (
        this.db
          .prepare(`${cte} SELECT COUNT(*) AS n FROM ranked`)
          .get(args) as any
      ).n as number;
      const pageCount = Math.max(1, Math.ceil(count / 10)),
        page = Math.max(1, Math.min(Math.trunc(requestedPage) || 1, pageCount));
      const decode = (r: any): RankedDiscEntry => ({
        ownerId: r.owner_id,
        uid: r.uid,
        characterId: r.character_id,
        playerName: r.player_name,
        avatarSource: r.avatar_source ?? undefined,
        portraitSource: r.portrait_source,
        skinName: r.skin_name,
        total: r.total / 10,
        grade: r.grade,
        updatedAt: r.updated_at,
        rank: r.rank,
        effectiveRolls: JSON.parse(r.raw_json).effectiveRolls ?? null,
        portraitColor: JSON.parse(r.raw_json).portraitColor ?? null,
      });
      const entries = this.db
        .prepare(
          `${cte} SELECT * FROM ranked ORDER BY total DESC,owner_id LIMIT 10 OFFSET @offset`,
        )
        .all({ ...args, offset: (page - 1) * 10 })
        .map(decode);
      const own = this.db
        .prepare(`${cte} SELECT * FROM ranked WHERE owner_id=@viewer`)
        .get({ ...args, viewer: viewerId });
      return {
        entries,
        viewer: own ? decode(own) : undefined,
        page,
        pageCount,
        participantCount: count,
        scoringHash: this.active().snapshot.hash,
        enabled: this.enabled(viewerId),
      };
    })();
  }
  /** Calculate outside the write lock, then publish all scores and their version atomically. */
  syncScoring(snapshot: ScoringSnapshot): Promise<void> {
    if (this.rebuilding) return this.rebuilding;
    const active = this.active();
    if (
      active.version === SCORE_VERSION &&
      (active.snapshot.hash === snapshot.hash ||
        active.snapshot.fetchedAt > snapshot.fetchedAt)
    )
      return Promise.resolve();
    this.rebuilding = this.rebuild(snapshot).finally(() => {
      this.rebuilding = undefined;
    });
    return this.rebuilding;
  }
  private async rebuild(snapshot: ScoringSnapshot) {
    const rows = this.db
      .prepare(
        "SELECT uid,character_id,raw_json,request_id,requested_at FROM disc_entries",
      )
      .all() as StoredEntry[];
    const calculated = new Map<
      string,
      { raw: string; score: ReturnType<typeof result> }
    >();
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      calculated.set(`${row.uid}:${row.character_id}`, {
        raw: row.raw_json,
        score: result(JSON.parse(row.raw_json), snapshot),
      });
      if (index % 100 === 99)
        await new Promise<void>((resolve) => setImmediate(resolve));
    }
    this.db
      .transaction(() => {
        const active = this.active();
        if (
          active.version === SCORE_VERSION &&
          (active.snapshot.hash === snapshot.hash ||
            active.snapshot.fetchedAt > snapshot.fetchedAt)
        )
          return;
        const current = this.db
          .prepare("SELECT uid,character_id,raw_json FROM disc_entries")
          .all() as StoredEntry[];
        const update = this.db.prepare(
          "UPDATE disc_entries SET total=?,grade=? WHERE uid=? AND character_id=?",
        );
        for (const row of current) {
          const cached = calculated.get(`${row.uid}:${row.character_id}`);
          const score =
            cached?.raw === row.raw_json
              ? cached.score
              : result(JSON.parse(row.raw_json), snapshot);
          update.run(score.total, score.grade, row.uid, row.character_id);
        }
        this.db
          .prepare("UPDATE disc_meta SET value=? WHERE key='active'")
          .run(JSON.stringify({ snapshot, version: SCORE_VERSION }));
      })
      .immediate();
  }
}
let store: DiscLeaderboardStore | undefined;
export function getDiscLeaderboardStore(): DiscLeaderboardStore {
  return (store ??= new DiscLeaderboardStore(
    process.env.ZZZ_DISC_LEADERBOARD_DB || undefined,
  ));
}
