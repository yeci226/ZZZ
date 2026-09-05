import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

export type GachaArchiveSource = "official" | "manual";
export type GachaChannelCategory =
  | "character_up"
  | "character_return"
  | "weapon_up"
  | "weapon_return"
  | "standard"
  | "bangboo"
  | "unknown";

export interface GachaArchiveAccount {
  ownerId: string;
  uid: string;
  region: string;
  source: GachaArchiveSource;
  weeklyEnabled: boolean;
  lastSyncedAt: string | null;
  syncStatus: "idle" | "ok" | "failed";
  lastError: string | null;
  orphanedAt: string | null;
  purgeAfter: string | null;
  purgeWarnedAt: string | null;
  everLinked: boolean;
}

export interface GachaArchiveRecord {
  ownerId: string;
  uid: string;
  source: GachaArchiveSource;
  gachaType: string;
  channelCategory?: GachaChannelCategory;
  bannerId?: string | null;
  recordId: string;
  itemId: string;
  name: string;
  itemType: string;
  rarity: string;
  pulledAt: string;
  isUp?: boolean | null;
  firstSavedAt?: string;
}

export interface GachaUpPeriod {
  region: string;
  periodId: string;
  channelCategory: GachaChannelCategory;
  startAt: string | null;
  endAt: string | null;
  recordMatchable: boolean;
  sUpItemIds: string[];
  sUpComplete: boolean;
  updatedAt?: string;
}

export interface ArchiveRecordQuery {
  ownerId: string;
  uid: string;
  source: GachaArchiveSource;
  gachaType?: string;
  channelCategory?: GachaChannelCategory;
  bannerId?: string | null;
  limit?: number;
  offset?: number;
}

export interface GachaArchiveBanner {
  ownerId: string;
  uid: string;
  source: GachaArchiveSource;
  bannerId: string;
  channelCategory: GachaChannelCategory;
  name: string;
  version: string;
  startAt: string | null;
  endAt: string | null;
  upItems: Array<{
    id: string;
    name: string;
    icon: string;
    rarity?: string;
    itemType?: "character" | "weapon" | "bangboo" | "unknown";
    elementType?: number;
    subElementType?: number;
    profession?: string | number;
  }>;
  updatedAt?: string;
}

export interface PersistedSignalLogSession {
  token: string;
  invokerId: string;
  ownerId: string;
  accountIndex: number;
  uid: string;
  playerName: string;
  locale: string;
  linked: boolean;
  region: string;
  source: GachaArchiveSource;
  category: GachaChannelCategory;
  bannerId: string | null;
  bannerPage: number;
  page: number;
  stale: boolean;
  createdAt?: string;
  updatedAt?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function iso(value: Date | string | number = new Date()): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function bool(value: unknown): boolean {
  return Number(value) === 1;
}

function cleanError(value: unknown): string {
  const message = value instanceof Error ? value.message : String(value ?? "同步失敗");
  return message
    .replace(/\b(authkey|cookie|ltoken|stoken|account_id|ltuid)=([^&\s;]+)/gi, "$1=[redacted]")
    .slice(0, 500);
}

export class GachaArchiveStore {
  private readonly db: Database.Database;

  constructor(filePath = join(process.cwd(), "data", "zzz-gacha-archive.sqlite")) {
    if (filePath !== ":memory:") mkdirSync(dirname(filePath), { recursive: true });
    this.db = new Database(filePath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS archive_accounts (
        owner_id TEXT NOT NULL,
        uid TEXT NOT NULL,
        region TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL CHECK (source IN ('official', 'manual')),
        weekly_enabled INTEGER NOT NULL DEFAULT 0,
        last_synced_at TEXT,
        sync_status TEXT NOT NULL DEFAULT 'idle',
        last_error TEXT,
        orphaned_at TEXT,
        purge_after TEXT,
        purge_warned_at TEXT,
        ever_linked INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (owner_id, uid, source)
      );

      CREATE TABLE IF NOT EXISTS gacha_records (
        owner_id TEXT NOT NULL,
        uid TEXT NOT NULL,
        source TEXT NOT NULL CHECK (source IN ('official', 'manual')),
        gacha_type TEXT NOT NULL,
        channel_category TEXT NOT NULL DEFAULT 'unknown',
        banner_id TEXT,
        record_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        name TEXT NOT NULL,
        item_type TEXT NOT NULL,
        rarity TEXT NOT NULL,
        pulled_at TEXT NOT NULL,
        is_up INTEGER,
        first_saved_at TEXT NOT NULL,
        PRIMARY KEY (owner_id, uid, source, record_id),
        FOREIGN KEY (owner_id, uid, source)
          REFERENCES archive_accounts(owner_id, uid, source) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_gacha_records_lookup
        ON gacha_records(owner_id, uid, source, gacha_type, pulled_at DESC, record_id DESC);
      CREATE INDEX IF NOT EXISTS idx_archive_accounts_purge
        ON archive_accounts(purge_after);
      CREATE INDEX IF NOT EXISTS idx_archive_accounts_weekly
        ON archive_accounts(source, weekly_enabled, orphaned_at, last_synced_at);

      CREATE TABLE IF NOT EXISTS gacha_banners (
        owner_id TEXT NOT NULL,
        uid TEXT NOT NULL,
        source TEXT NOT NULL CHECK (source IN ('official', 'manual')),
        banner_id TEXT NOT NULL,
        channel_category TEXT NOT NULL DEFAULT 'unknown',
        name TEXT NOT NULL DEFAULT '',
        version TEXT NOT NULL DEFAULT '',
        start_at TEXT,
        end_at TEXT,
        up_items_json TEXT NOT NULL DEFAULT '[]',
        updated_at TEXT NOT NULL,
        PRIMARY KEY (owner_id, uid, source, banner_id),
        FOREIGN KEY (owner_id, uid, source)
          REFERENCES archive_accounts(owner_id, uid, source) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_gacha_banners_lookup
        ON gacha_banners(owner_id, uid, source, channel_category, start_at DESC, banner_id DESC);

      CREATE TABLE IF NOT EXISTS gacha_up_periods (
        region TEXT NOT NULL,
        period_id TEXT NOT NULL,
        channel_category TEXT NOT NULL,
        start_at TEXT,
        end_at TEXT,
        record_matchable INTEGER NOT NULL DEFAULT 0,
        s_up_item_ids_json TEXT NOT NULL DEFAULT '[]',
        s_up_complete INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (region, channel_category, period_id)
      );

      CREATE INDEX IF NOT EXISTS idx_gacha_up_periods_time
        ON gacha_up_periods(region, channel_category, start_at, end_at);

      CREATE TABLE IF NOT EXISTS signal_log_sessions (
        token TEXT PRIMARY KEY,
        invoker_id TEXT NOT NULL,
        owner_id TEXT NOT NULL,
        account_index INTEGER NOT NULL DEFAULT 0,
        uid TEXT NOT NULL,
        player_name TEXT NOT NULL DEFAULT '',
        locale TEXT NOT NULL DEFAULT 'tw',
        linked INTEGER NOT NULL DEFAULT 0,
        region TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL CHECK (source IN ('official', 'manual')),
        category TEXT NOT NULL DEFAULT 'character_up',
        banner_id TEXT,
        banner_page INTEGER NOT NULL DEFAULT 0,
        page INTEGER NOT NULL DEFAULT 0,
        stale INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (owner_id, uid, source)
          REFERENCES archive_accounts(owner_id, uid, source) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_signal_log_sessions_account
        ON signal_log_sessions(owner_id, uid, source);
    `);
    const columns = this.db.prepare("PRAGMA table_info(gacha_records)").all() as Array<{ name: string }>;
    const names = new Set(columns.map((column) => column.name));
    if (!names.has("channel_category")) {
      this.db.exec("ALTER TABLE gacha_records ADD COLUMN channel_category TEXT NOT NULL DEFAULT 'unknown'");
    }
    if (!names.has("banner_id")) {
      this.db.exec("ALTER TABLE gacha_records ADD COLUMN banner_id TEXT");
    }
    if (!names.has("is_up")) {
      this.db.exec("ALTER TABLE gacha_records ADD COLUMN is_up INTEGER");
    }
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_gacha_records_banner_lookup
        ON gacha_records(owner_id, uid, source, channel_category, banner_id, pulled_at DESC, record_id DESC);
      UPDATE gacha_records SET channel_category = CASE
        WHEN UPPER(gacha_type) LIKE '%CHARACTER_RETURN%' OR UPPER(gacha_type) LIKE '%AVATAR_RETURN%' OR gacha_type = '21' THEN 'character_return'
        WHEN UPPER(gacha_type) LIKE '%WEAPON_RETURN%' OR UPPER(gacha_type) LIKE '%W_ENGINE_RETURN%' OR gacha_type = '22' THEN 'weapon_return'
        WHEN UPPER(gacha_type) LIKE '%CHARACTER%' OR UPPER(gacha_type) LIKE '%AVATAR%' OR gacha_type IN ('2', '11', '2001', 'character') THEN 'character_up'
        WHEN UPPER(gacha_type) LIKE '%WEAPON%' OR UPPER(gacha_type) LIKE '%W_ENGINE%' OR gacha_type IN ('3', '12', '3001', 'weapon') THEN 'weapon_up'
        WHEN UPPER(gacha_type) LIKE '%STANDARD%' OR UPPER(gacha_type) LIKE '%REGULAR%' OR UPPER(gacha_type) LIKE '%PERMANENT%' OR gacha_type IN ('1', 'regular') THEN 'standard'
        WHEN UPPER(gacha_type) LIKE '%BANGBOO%' OR UPPER(gacha_type) LIKE '%BOOPON%' OR gacha_type IN ('5', 'bangboo') THEN 'bangboo'
        ELSE channel_category
      END
      WHERE channel_category = 'unknown'
    `);
    // The public manual API uses gacha_id=0 to mean that no stable banner ID
    // was supplied. Older builds persisted it as a real ID, which collapsed
    // unrelated channel categories into the same banner row.
    this.db.exec(`
      UPDATE gacha_records SET banner_id = NULL WHERE TRIM(COALESCE(banner_id, '')) = '0';
      DELETE FROM gacha_banners WHERE TRIM(banner_id) = '0';
    `);
  }

  close(): void {
    this.db.close();
  }

  upsertAccount(input: {
    ownerId: string;
    uid: string;
    region?: string;
    source: GachaArchiveSource;
    everLinked?: boolean;
  }): GachaArchiveAccount {
    const now = iso();
    this.db.prepare(`
      INSERT INTO archive_accounts (
        owner_id, uid, region, source, ever_linked, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(owner_id, uid, source) DO UPDATE SET
        region = CASE WHEN excluded.region <> '' THEN excluded.region ELSE region END,
        ever_linked = MAX(ever_linked, excluded.ever_linked),
        updated_at = excluded.updated_at
    `).run(
      input.ownerId,
      input.uid,
      input.region ?? "",
      input.source,
      input.everLinked ? 1 : 0,
      now,
      now,
    );
    return this.getAccount(input.ownerId, input.uid, input.source)!;
  }

  getAccount(ownerId: string, uid: string, source: GachaArchiveSource): GachaArchiveAccount | null {
    const row = this.db.prepare(`
      SELECT * FROM archive_accounts WHERE owner_id = ? AND uid = ? AND source = ?
    `).get(ownerId, uid, source) as Record<string, unknown> | undefined;
    return row ? this.mapAccount(row) : null;
  }

  listAccounts(ownerId: string): GachaArchiveAccount[] {
    const rows = this.db.prepare(`
      SELECT * FROM archive_accounts WHERE owner_id = ? ORDER BY uid, source
    `).all(ownerId) as Record<string, unknown>[];
    return rows.map((row) => this.mapAccount(row));
  }

  listWeeklyDue(before: Date, limit = 100): GachaArchiveAccount[] {
    const rows = this.db.prepare(`
      SELECT * FROM archive_accounts
      WHERE source = 'official' AND weekly_enabled = 1 AND orphaned_at IS NULL
        AND (last_synced_at IS NULL OR last_synced_at <= ?)
      ORDER BY COALESCE(last_synced_at, '') ASC
      LIMIT ?
    `).all(iso(before), Math.max(1, Math.min(limit, 1000))) as Record<string, unknown>[];
    return rows.map((row) => this.mapAccount(row));
  }

  addRecords(records: GachaArchiveRecord[]): number {
    if (records.length === 0) return 0;
    const insert = this.db.prepare(`
      INSERT OR IGNORE INTO gacha_records (
        owner_id, uid, source, gacha_type, channel_category, banner_id, record_id, item_id,
        name, item_type, rarity, pulled_at, is_up, first_saved_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const transaction = this.db.transaction((items: GachaArchiveRecord[]) => {
      let inserted = 0;
      for (const record of items) {
        this.upsertAccount({
          ownerId: record.ownerId,
          uid: record.uid,
          source: record.source,
        });
        const result = insert.run(
          record.ownerId,
          record.uid,
          record.source,
          record.gachaType,
          record.channelCategory ?? "unknown",
          record.bannerId || null,
          record.recordId,
          record.itemId,
          record.name,
          record.itemType,
          record.rarity,
          record.pulledAt,
          record.isUp === true ? 1 : record.isUp === false ? 0 : null,
          record.firstSavedAt ?? iso(),
        );
        inserted += result.changes;
      }
      return inserted;
    });
    return transaction(records);
  }

  listRecords(query: ArchiveRecordQuery): GachaArchiveRecord[] {
    const limit = Math.max(1, Math.min(query.limit ?? 50, 200));
    const offset = Math.max(0, query.offset ?? 0);
    const params: Array<string | number> = [query.ownerId, query.uid, query.source];
    let filter = "";
    if (query.gachaType) {
      filter = " AND gacha_type = ?";
      params.push(query.gachaType);
    }
    if (query.channelCategory) {
      filter += " AND channel_category = ?";
      params.push(query.channelCategory);
    }
    if (query.bannerId !== undefined) {
      filter += query.bannerId === null ? " AND (banner_id IS NULL OR banner_id = '')" : " AND banner_id = ?";
      if (query.bannerId !== null) params.push(query.bannerId);
    }
    params.push(limit, offset);
    const rows = this.db.prepare(`
      SELECT * FROM gacha_records
      WHERE owner_id = ? AND uid = ? AND source = ?${filter}
      ORDER BY pulled_at DESC, record_id DESC
      LIMIT ? OFFSET ?
    `).all(...params) as Record<string, unknown>[];
    return rows.map((row) => this.mapRecord(row));
  }

  countRecords(query: Omit<ArchiveRecordQuery, "limit" | "offset">): number {
    const params: string[] = [query.ownerId, query.uid, query.source];
    let filter = "";
    if (query.gachaType) {
      filter = " AND gacha_type = ?";
      params.push(query.gachaType);
    }
    if (query.channelCategory) {
      filter += " AND channel_category = ?";
      params.push(query.channelCategory);
    }
    if (query.bannerId !== undefined) {
      filter += query.bannerId === null ? " AND (banner_id IS NULL OR banner_id = '')" : " AND banner_id = ?";
      if (query.bannerId !== null) params.push(query.bannerId);
    }
    const row = this.db.prepare(`
      SELECT COUNT(*) AS count FROM gacha_records
      WHERE owner_id = ? AND uid = ? AND source = ?${filter}
    `).get(...params) as { count: number };
    return Number(row.count);
  }

  listTimeline(query: Omit<ArchiveRecordQuery, "limit" | "offset">): GachaArchiveRecord[] {
    const params: string[] = [query.ownerId, query.uid, query.source];
    let filter = "";
    if (query.gachaType) {
      filter += " AND gacha_type = ?";
      params.push(query.gachaType);
    }
    if (query.channelCategory) {
      filter += " AND channel_category = ?";
      params.push(query.channelCategory);
    }
    if (query.bannerId !== undefined) {
      filter += query.bannerId === null ? " AND (banner_id IS NULL OR banner_id = '')" : " AND banner_id = ?";
      if (query.bannerId !== null) params.push(query.bannerId);
    }
    const rows = this.db.prepare(`
      SELECT * FROM gacha_records
      WHERE owner_id = ? AND uid = ? AND source = ?${filter}
      ORDER BY pulled_at ASC, record_id ASC
    `).all(...params) as Record<string, unknown>[];
    return rows.map((row) => this.mapRecord(row));
  }

  setWeeklyEnabled(ownerId: string, uid: string, enabled: boolean): void {
    this.db.prepare(`
      UPDATE archive_accounts SET weekly_enabled = ?, updated_at = ?
      WHERE owner_id = ? AND uid = ? AND source = 'official'
    `).run(enabled ? 1 : 0, iso(), ownerId, uid);
  }

  upsertBanner(input: GachaArchiveBanner): void {
    this.upsertAccount({ ownerId: input.ownerId, uid: input.uid, source: input.source });
    this.db.prepare(`
      INSERT INTO gacha_banners (
        owner_id, uid, source, banner_id, channel_category, name, version,
        start_at, end_at, up_items_json, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(owner_id, uid, source, banner_id) DO UPDATE SET
        channel_category = excluded.channel_category,
        name = CASE WHEN excluded.name <> '' THEN excluded.name ELSE name END,
        version = CASE WHEN excluded.version <> '' THEN excluded.version ELSE version END,
        start_at = COALESCE(excluded.start_at, start_at),
        end_at = COALESCE(excluded.end_at, end_at),
        up_items_json = CASE WHEN excluded.up_items_json <> '[]' THEN excluded.up_items_json ELSE up_items_json END,
        updated_at = excluded.updated_at
    `).run(
      input.ownerId, input.uid, input.source, input.bannerId, input.channelCategory,
      input.name, input.version, input.startAt, input.endAt,
      JSON.stringify(input.upItems ?? []), iso(),
    );
  }

  listBanners(input: {
    ownerId: string;
    uid: string;
    source: GachaArchiveSource;
    channelCategory?: GachaChannelCategory;
  }): GachaArchiveBanner[] {
    const params: string[] = [input.ownerId, input.uid, input.source];
    const filter = input.channelCategory ? " AND channel_category = ?" : "";
    if (input.channelCategory) params.push(input.channelCategory);
    const rows = this.db.prepare(`
      SELECT * FROM gacha_banners
      WHERE owner_id = ? AND uid = ? AND source = ?${filter}
      ORDER BY COALESCE(start_at, '') DESC, banner_id DESC
    `).all(...params) as Record<string, unknown>[];
    return rows.map((row) => this.mapBanner(row));
  }

  classifyUnresolvedBannerRecords(input: {
    ownerId: string;
    uid: string;
    source: GachaArchiveSource;
  }): number {
    const records = this.db.prepare(`
      SELECT record_id, channel_category, pulled_at
      FROM gacha_records
      WHERE owner_id = ? AND uid = ? AND source = ?
        AND (banner_id IS NULL OR banner_id = '' OR banner_id = '0')
    `).all(input.ownerId, input.uid, input.source) as Array<{
      record_id: string;
      channel_category: string;
      pulled_at: string;
    }>;
    const banners = this.listBanners(input).filter((banner) => banner.startAt && banner.endAt);
    const update = this.db.prepare(`
      UPDATE gacha_records SET banner_id = ?
      WHERE owner_id = ? AND uid = ? AND source = ? AND record_id = ?
        AND (banner_id IS NULL OR banner_id = '' OR banner_id = '0')
    `);
    const transaction = this.db.transaction(() => {
      let updated = 0;
      for (const record of records) {
        const pulledAt = Date.parse(record.pulled_at);
        if (!Number.isFinite(pulledAt)) continue;
        const matching = banners.filter((banner) => {
          if (banner.channelCategory !== record.channel_category) return false;
          const start = Date.parse(banner.startAt!);
          const end = Date.parse(banner.endAt!);
          return Number.isFinite(start) && Number.isFinite(end) && start <= pulledAt && pulledAt < end;
        });
        if (matching.length !== 1) continue;
        updated += update.run(
          matching[0]!.bannerId,
          input.ownerId,
          input.uid,
          input.source,
          record.record_id,
        ).changes;
      }
      return updated;
    });
    return transaction();
  }

  saveSignalLogSession(input: PersistedSignalLogSession): void {
    const now = iso();
    this.db.prepare(`
      INSERT INTO signal_log_sessions (
        token, invoker_id, owner_id, account_index, uid, player_name, locale,
        linked, region, source, category, banner_id, banner_page, page, stale,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(token) DO UPDATE SET
        invoker_id = excluded.invoker_id,
        owner_id = excluded.owner_id,
        account_index = excluded.account_index,
        uid = excluded.uid,
        player_name = excluded.player_name,
        locale = excluded.locale,
        linked = excluded.linked,
        region = excluded.region,
        source = excluded.source,
        category = excluded.category,
        banner_id = excluded.banner_id,
        banner_page = excluded.banner_page,
        page = excluded.page,
        stale = excluded.stale,
        updated_at = excluded.updated_at
    `).run(
      input.token,
      input.invokerId,
      input.ownerId,
      input.accountIndex,
      input.uid,
      input.playerName,
      input.locale,
      input.linked ? 1 : 0,
      input.region,
      input.source,
      input.category,
      input.bannerId,
      input.bannerPage,
      input.page,
      input.stale ? 1 : 0,
      input.createdAt ?? now,
      now,
    );
  }

  getSignalLogSession(token: string): PersistedSignalLogSession | null {
    const row = this.db.prepare(`
      SELECT * FROM signal_log_sessions WHERE token = ?
    `).get(token) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      token: String(row.token),
      invokerId: String(row.invoker_id),
      ownerId: String(row.owner_id),
      accountIndex: Number(row.account_index) || 0,
      uid: String(row.uid),
      playerName: String(row.player_name ?? ""),
      locale: String(row.locale ?? "tw"),
      linked: bool(row.linked),
      region: String(row.region ?? ""),
      source: String(row.source) as GachaArchiveSource,
      category: String(row.category ?? "character_up") as GachaChannelCategory,
      bannerId: row.banner_id ? String(row.banner_id) : null,
      bannerPage: Math.max(0, Number(row.banner_page) || 0),
      page: Math.max(0, Number(row.page) || 0),
      stale: bool(row.stale),
      createdAt: String(row.created_at ?? ""),
      updatedAt: String(row.updated_at ?? ""),
    };
  }

  upsertUpPeriod(input: GachaUpPeriod): void {
    const existing = this.db.prepare(`
      SELECT s_up_item_ids_json, s_up_complete FROM gacha_up_periods
      WHERE region = ? AND channel_category = ? AND period_id = ?
    `).get(input.region, input.channelCategory, input.periodId) as Record<string, unknown> | undefined;
    let previousIds: string[] = [];
    try {
      const parsed = JSON.parse(String(existing?.s_up_item_ids_json ?? "[]"));
      if (Array.isArray(parsed)) previousIds = parsed.map(String);
    } catch {
      previousIds = [];
    }
    const ids = [...new Set([...previousIds, ...input.sUpItemIds.map(String).filter(Boolean)])];
    this.db.prepare(`
      INSERT INTO gacha_up_periods (
        region, period_id, channel_category, start_at, end_at, record_matchable,
        s_up_item_ids_json, s_up_complete, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(region, channel_category, period_id) DO UPDATE SET
        start_at = COALESCE(excluded.start_at, start_at),
        end_at = COALESCE(excluded.end_at, end_at),
        record_matchable = MAX(record_matchable, excluded.record_matchable),
        s_up_item_ids_json = excluded.s_up_item_ids_json,
        s_up_complete = MAX(s_up_complete, excluded.s_up_complete),
        updated_at = excluded.updated_at
    `).run(
      input.region, input.periodId, input.channelCategory, input.startAt, input.endAt,
      input.recordMatchable ? 1 : 0, JSON.stringify(ids), input.sUpComplete ? 1 : 0, iso(),
    );
  }

  listUpPeriods(region: string, channelCategory?: GachaChannelCategory): GachaUpPeriod[] {
    const params: string[] = [region];
    const filter = channelCategory ? " AND channel_category = ?" : "";
    if (channelCategory) params.push(channelCategory);
    const rows = this.db.prepare(`
      SELECT * FROM gacha_up_periods
      WHERE region = ?${filter}
      ORDER BY COALESCE(start_at, '') ASC, period_id ASC
    `).all(...params) as Record<string, unknown>[];
    return rows.map((row) => this.mapUpPeriod(row));
  }

  classifyUnresolvedUpRecords(input: {
    ownerId: string;
    uid: string;
    source: GachaArchiveSource;
    region: string;
  }): number {
    // Bangboo S-ranks are always the selected target. Persist that invariant
    // without requiring calendar periods, and repair any stale false values.
    let updated = this.db.prepare(`
      UPDATE gacha_records SET is_up = 1
      WHERE owner_id = ? AND uid = ? AND source = ?
        AND channel_category = 'bangboo'
        AND UPPER(rarity) IN ('S', '4', '5')
        AND (is_up IS NULL OR is_up <> 1)
    `).run(input.ownerId, input.uid, input.source).changes;
    const rows = this.db.prepare(`
      SELECT * FROM gacha_records
      WHERE owner_id = ? AND uid = ? AND source = ? AND is_up IS NULL
    `).all(input.ownerId, input.uid, input.source) as Record<string, unknown>[];
    const records = rows.map((row) => this.mapRecord(row));
    const periodsByCategory = new Map<GachaChannelCategory, GachaUpPeriod[]>();
    const update = this.db.prepare(`
      UPDATE gacha_records SET is_up = ?
      WHERE owner_id = ? AND uid = ? AND source = ? AND record_id = ? AND is_up IS NULL
    `);
    const transaction = this.db.transaction(() => {
      for (const record of records) {
        const category = record.channelCategory ?? "unknown";
        if (!isLimitedCategory(category) || !isSRarity(record.rarity) || !record.itemId) continue;
        let periods = periodsByCategory.get(category);
        if (!periods) {
          periods = this.listUpPeriods(input.region, category);
          periodsByCategory.set(category, periods);
        }
        const exact = record.bannerId
          ? periods.filter((period) => period.recordMatchable && period.periodId === record.bannerId)
          : [];
        const pulledAt = Date.parse(record.pulledAt);
        const matching = exact.length ? exact : periods.filter((period) => {
          const start = period.startAt ? Date.parse(period.startAt) : Number.NaN;
          const end = period.endAt ? Date.parse(period.endAt) : Number.NaN;
          return Number.isFinite(pulledAt) && Number.isFinite(start) && Number.isFinite(end)
            && start <= pulledAt && pulledAt < end;
        });
        if (!matching.length || matching.some((period) => !period.sUpComplete)) continue;
        const ids = new Set(matching.flatMap((period) => period.sUpItemIds));
        if (!ids.size) continue;
        updated += update.run(
          ids.has(String(record.itemId)) ? 1 : 0,
          input.ownerId, input.uid, input.source, record.recordId,
        ).changes;
      }
    });
    transaction();
    return updated;
  }

  recordSyncSuccess(ownerId: string, uid: string, source: GachaArchiveSource, at = new Date()): void {
    this.db.prepare(`
      UPDATE archive_accounts SET last_synced_at = ?, sync_status = 'ok',
        last_error = NULL, updated_at = ?
      WHERE owner_id = ? AND uid = ? AND source = ?
    `).run(iso(at), iso(at), ownerId, uid, source);
  }

  recordSyncFailure(ownerId: string, uid: string, source: GachaArchiveSource, error: unknown): void {
    this.db.prepare(`
      UPDATE archive_accounts SET sync_status = 'failed', last_error = ?, updated_at = ?
      WHERE owner_id = ? AND uid = ? AND source = ?
    `).run(cleanError(error), iso(), ownerId, uid, source);
  }

  markOrphaned(ownerId: string, uid: string, at = new Date()): number {
    const orphanedAt = iso(at);
    const purgeAfter = iso(at.getTime() + 90 * DAY_MS);
    return this.db.prepare(`
      UPDATE archive_accounts SET orphaned_at = ?, purge_after = ?, purge_warned_at = NULL,
        weekly_enabled = 0, updated_at = ?
      WHERE owner_id = ? AND uid = ? AND ever_linked = 1 AND orphaned_at IS NULL
    `).run(orphanedAt, purgeAfter, orphanedAt, ownerId, uid).changes;
  }

  restoreLinked(ownerId: string, uid: string, region = ""): number {
    return this.db.prepare(`
      UPDATE archive_accounts SET orphaned_at = NULL, purge_after = NULL,
        purge_warned_at = NULL, ever_linked = 1,
        region = CASE WHEN ? <> '' THEN ? ELSE region END, updated_at = ?
      WHERE owner_id = ? AND uid = ?
    `).run(region, region, iso(), ownerId, uid).changes;
  }

  listPurgeWarnings(now = new Date()): GachaArchiveAccount[] {
    const sevenDaysFromNow = iso(now.getTime() + 7 * DAY_MS);
    const rows = this.db.prepare(`
      SELECT * FROM archive_accounts
      WHERE purge_after IS NOT NULL AND purge_after > ? AND purge_after <= ?
        AND purge_warned_at IS NULL
      ORDER BY purge_after ASC
    `).all(iso(now), sevenDaysFromNow) as Record<string, unknown>[];
    return rows.map((row) => this.mapAccount(row));
  }

  markPurgeWarned(ownerId: string, uid: string, source: GachaArchiveSource, at = new Date()): void {
    this.db.prepare(`
      UPDATE archive_accounts SET purge_warned_at = ?, updated_at = ?
      WHERE owner_id = ? AND uid = ? AND source = ?
    `).run(iso(at), iso(at), ownerId, uid, source);
  }

  purgeExpired(now = new Date()): number {
    return this.db.prepare(`
      DELETE FROM archive_accounts WHERE purge_after IS NOT NULL AND purge_after <= ?
    `).run(iso(now)).changes;
  }

  clear(ownerId: string, uid: string, source?: GachaArchiveSource): number {
    if (source) {
      return this.db.prepare(`
        DELETE FROM archive_accounts WHERE owner_id = ? AND uid = ? AND source = ?
      `).run(ownerId, uid, source).changes;
    }
    return this.db.prepare(`
      DELETE FROM archive_accounts WHERE owner_id = ? AND uid = ?
    `).run(ownerId, uid).changes;
  }

  private mapAccount(row: Record<string, unknown>): GachaArchiveAccount {
    return {
      ownerId: String(row.owner_id),
      uid: String(row.uid),
      region: String(row.region ?? ""),
      source: String(row.source) as GachaArchiveSource,
      weeklyEnabled: bool(row.weekly_enabled),
      lastSyncedAt: row.last_synced_at ? String(row.last_synced_at) : null,
      syncStatus: String(row.sync_status) as GachaArchiveAccount["syncStatus"],
      lastError: row.last_error ? String(row.last_error) : null,
      orphanedAt: row.orphaned_at ? String(row.orphaned_at) : null,
      purgeAfter: row.purge_after ? String(row.purge_after) : null,
      purgeWarnedAt: row.purge_warned_at ? String(row.purge_warned_at) : null,
      everLinked: bool(row.ever_linked),
    };
  }

  private mapRecord(row: Record<string, unknown>): GachaArchiveRecord {
    return {
      ownerId: String(row.owner_id),
      uid: String(row.uid),
      source: String(row.source) as GachaArchiveSource,
      gachaType: String(row.gacha_type),
      channelCategory: String(row.channel_category ?? "unknown") as GachaChannelCategory,
      bannerId: row.banner_id ? String(row.banner_id) : null,
      recordId: String(row.record_id),
      itemId: String(row.item_id),
      name: String(row.name),
      itemType: String(row.item_type),
      rarity: String(row.rarity),
      pulledAt: String(row.pulled_at),
      isUp: row.is_up === null || row.is_up === undefined ? null : bool(row.is_up),
      firstSavedAt: String(row.first_saved_at),
    };
  }

  private mapBanner(row: Record<string, unknown>): GachaArchiveBanner {
    let upItems: GachaArchiveBanner["upItems"] = [];
    try {
      const parsed = JSON.parse(String(row.up_items_json ?? "[]"));
      if (Array.isArray(parsed)) upItems = parsed;
    } catch {
      upItems = [];
    }
    return {
      ownerId: String(row.owner_id), uid: String(row.uid),
      source: String(row.source) as GachaArchiveSource,
      bannerId: String(row.banner_id),
      channelCategory: String(row.channel_category ?? "unknown") as GachaChannelCategory,
      name: String(row.name ?? ""), version: String(row.version ?? ""),
      startAt: row.start_at ? String(row.start_at) : null,
      endAt: row.end_at ? String(row.end_at) : null,
      upItems, updatedAt: String(row.updated_at ?? ""),
    };
  }

  private mapUpPeriod(row: Record<string, unknown>): GachaUpPeriod {
    let ids: string[] = [];
    try {
      const parsed = JSON.parse(String(row.s_up_item_ids_json ?? "[]"));
      if (Array.isArray(parsed)) ids = parsed.map(String).filter(Boolean);
    } catch {
      ids = [];
    }
    return {
      region: String(row.region ?? ""),
      periodId: String(row.period_id),
      channelCategory: String(row.channel_category ?? "unknown") as GachaChannelCategory,
      startAt: row.start_at ? String(row.start_at) : null,
      endAt: row.end_at ? String(row.end_at) : null,
      recordMatchable: bool(row.record_matchable),
      sUpItemIds: ids,
      sUpComplete: bool(row.s_up_complete),
      updatedAt: String(row.updated_at ?? ""),
    };
  }
}

function isLimitedCategory(category: GachaChannelCategory): boolean {
  return category === "character_up" || category === "character_return"
    || category === "weapon_up" || category === "weapon_return";
}

function isSRarity(value: unknown): boolean {
  const rarity = String(value ?? "").toUpperCase();
  return rarity === "S" || rarity === "4" || rarity === "5";
}

let singleton: GachaArchiveStore | null = null;

export function getGachaArchiveStore(): GachaArchiveStore {
  singleton ??= new GachaArchiveStore(process.env.ZZZ_GACHA_ARCHIVE_PATH);
  return singleton;
}
