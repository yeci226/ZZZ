import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { normalizeSignalLogView, type SignalLogView } from "./signalLogPagination.js";

export type GachaArchiveSource = "official" | "manual" | "rng_moe";
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
  /** Every importer that has contributed data for this UID. */
  sources?: GachaArchiveSource[];
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

export interface GachaMergeResult {
  inserted: number;
  duplicates: number;
  conflicts: number;
  sourceAdded: number;
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
  /** Omit to read the unified history. Supplying it filters by provenance. */
  source?: GachaArchiveSource;
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
  view?: SignalLogView;
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
    const accountColumns = this.tableColumns("archive_accounts");
    if (accountColumns.has("source")) this.migrateUnifiedArchive();
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS archive_accounts (
        owner_id TEXT NOT NULL,
        uid TEXT NOT NULL,
        region TEXT NOT NULL DEFAULT '',
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
        PRIMARY KEY (owner_id, uid)
      );

      CREATE TABLE IF NOT EXISTS archive_account_sources (
        owner_id TEXT NOT NULL,
        uid TEXT NOT NULL,
        source TEXT NOT NULL CHECK (source IN ('official', 'manual', 'rng_moe')),
        first_seen_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        PRIMARY KEY (owner_id, uid, source),
        FOREIGN KEY (owner_id, uid)
          REFERENCES archive_accounts(owner_id, uid) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS gacha_records (
        owner_id TEXT NOT NULL,
        uid TEXT NOT NULL,
        source TEXT NOT NULL CHECK (source IN ('official', 'manual', 'rng_moe')),
        source_rank INTEGER NOT NULL DEFAULT 0,
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
        PRIMARY KEY (owner_id, uid, record_id),
        FOREIGN KEY (owner_id, uid)
          REFERENCES archive_accounts(owner_id, uid) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS gacha_record_sources (
        owner_id TEXT NOT NULL,
        uid TEXT NOT NULL,
        record_id TEXT NOT NULL,
        source TEXT NOT NULL CHECK (source IN ('official', 'manual', 'rng_moe')),
        raw_banner_id TEXT,
        first_seen_at TEXT NOT NULL,
        PRIMARY KEY (owner_id, uid, record_id, source),
        FOREIGN KEY (owner_id, uid, record_id)
          REFERENCES gacha_records(owner_id, uid, record_id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_gacha_records_lookup
        ON gacha_records(owner_id, uid, gacha_type, pulled_at DESC, record_id DESC);
      CREATE INDEX IF NOT EXISTS idx_archive_accounts_purge
        ON archive_accounts(purge_after);
      CREATE INDEX IF NOT EXISTS idx_archive_accounts_weekly
        ON archive_accounts(weekly_enabled, orphaned_at, last_synced_at);
      -- v1 rollback tables retain the original index names after rename. Use
      -- distinct names so SQLite always builds indexes for the unified tables.
      CREATE INDEX IF NOT EXISTS idx_gacha_records_unified_lookup
        ON gacha_records(owner_id, uid, gacha_type, pulled_at DESC, record_id DESC);
      CREATE INDEX IF NOT EXISTS idx_archive_accounts_unified_purge
        ON archive_accounts(purge_after);
      CREATE INDEX IF NOT EXISTS idx_archive_accounts_unified_weekly
        ON archive_accounts(weekly_enabled, orphaned_at, last_synced_at);
      CREATE INDEX IF NOT EXISTS idx_archive_account_sources_unified_lookup
        ON archive_account_sources(owner_id, uid, source);
      CREATE INDEX IF NOT EXISTS idx_gacha_record_sources_unified_lookup
        ON gacha_record_sources(owner_id, uid, source, record_id);

      CREATE TABLE IF NOT EXISTS gacha_banners (
        owner_id TEXT NOT NULL,
        uid TEXT NOT NULL,
        source TEXT NOT NULL CHECK (source IN ('official', 'manual', 'rng_moe')),
        banner_id TEXT NOT NULL,
        channel_category TEXT NOT NULL DEFAULT 'unknown',
        name TEXT NOT NULL DEFAULT '',
        version TEXT NOT NULL DEFAULT '',
        start_at TEXT,
        end_at TEXT,
        up_items_json TEXT NOT NULL DEFAULT '[]',
        updated_at TEXT NOT NULL,
        PRIMARY KEY (owner_id, uid, source, banner_id),
        FOREIGN KEY (owner_id, uid)
          REFERENCES archive_accounts(owner_id, uid) ON DELETE CASCADE
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

      CREATE TABLE IF NOT EXISTS official_sync_state (
        owner_id TEXT NOT NULL,
        uid TEXT NOT NULL,
        gacha_type TEXT NOT NULL,
        newest_record_id TEXT NOT NULL,
        completed_at TEXT NOT NULL,
        PRIMARY KEY (owner_id, uid, gacha_type),
        FOREIGN KEY (owner_id, uid)
          REFERENCES archive_accounts(owner_id, uid) ON DELETE CASCADE
      );

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
        source TEXT NOT NULL DEFAULT 'official' CHECK (source IN ('official', 'manual', 'rng_moe')),
        category TEXT NOT NULL DEFAULT 'character_up',
        banner_id TEXT,
        banner_page INTEGER NOT NULL DEFAULT 0,
        page INTEGER NOT NULL DEFAULT 0,
        stale INTEGER NOT NULL DEFAULT 0,
        view TEXT NOT NULL DEFAULT 'overview',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (owner_id, uid)
          REFERENCES archive_accounts(owner_id, uid) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_signal_log_sessions_account
        ON signal_log_sessions(owner_id, uid, source);
    `);
    if (!this.tableColumns("signal_log_sessions").has("view")) {
      this.db.exec("ALTER TABLE signal_log_sessions ADD COLUMN view TEXT NOT NULL DEFAULT 'overview'");
    }
    const names = this.tableColumns("gacha_records");
    if (!names.has("channel_category")) {
      this.db.exec("ALTER TABLE gacha_records ADD COLUMN channel_category TEXT NOT NULL DEFAULT 'unknown'");
    }
    if (!names.has("banner_id")) {
      this.db.exec("ALTER TABLE gacha_records ADD COLUMN banner_id TEXT");
    }
    if (!names.has("is_up")) {
      this.db.exec("ALTER TABLE gacha_records ADD COLUMN is_up INTEGER");
    }
    if (!names.has("source_rank")) {
      this.db.exec("ALTER TABLE gacha_records ADD COLUMN source_rank INTEGER NOT NULL DEFAULT 0");
      this.db.exec("UPDATE gacha_records SET source_rank = CASE source WHEN 'official' THEN 3 WHEN 'manual' THEN 2 ELSE 1 END");
    }
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_gacha_records_banner_lookup
        ON gacha_records(owner_id, uid, channel_category, banner_id, pulled_at DESC, record_id DESC);
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
    if (this.tableColumns("gacha_banners_legacy_v1").size) {
      this.db.exec(`
        INSERT OR IGNORE INTO gacha_banners
        SELECT owner_id, uid, source, banner_id, channel_category, name, version,
          start_at, end_at, up_items_json, updated_at
        FROM gacha_banners_legacy_v1
        WHERE TRIM(COALESCE(banner_id, '')) NOT IN ('', '0')
      `);
    }
    // Deliberately leave v1 sessions in the rollback table. Their controls
    // predate unified history and should resolve as expired, asking the player
    // to run the command again instead of applying an old source filter.
  }

  private tableColumns(table: string): Set<string> {
    const exists = this.db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(table);
    if (!exists) return new Set();
    const rows = this.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    return new Set(rows.map((row) => row.name));
  }

  /**
   * Versioned, repeat-safe migration from source-split v1 storage. The renamed
   * tables intentionally remain as an on-disk rollback copy.
   */
  private migrateUnifiedArchive(): void {
    const now = iso();
    this.db.pragma("foreign_keys = OFF");
    const migrate = this.db.transaction(() => {
      if (!this.tableColumns("archive_accounts_legacy_v1").size) {
        this.db.exec("ALTER TABLE archive_accounts RENAME TO archive_accounts_legacy_v1");
      }
      if (!this.tableColumns("gacha_records_legacy_v1").size) {
        this.db.exec("ALTER TABLE gacha_records RENAME TO gacha_records_legacy_v1");
      }
      if (this.tableColumns("gacha_banners").size && !this.tableColumns("gacha_banners_legacy_v1").size) {
        this.db.exec("ALTER TABLE gacha_banners RENAME TO gacha_banners_legacy_v1");
      }
      if (this.tableColumns("signal_log_sessions").size && !this.tableColumns("signal_log_sessions_legacy_v1").size) {
        this.db.exec("ALTER TABLE signal_log_sessions RENAME TO signal_log_sessions_legacy_v1");
      }
      this.db.exec(`
        CREATE TABLE archive_accounts (
          owner_id TEXT NOT NULL, uid TEXT NOT NULL, region TEXT NOT NULL DEFAULT '',
          weekly_enabled INTEGER NOT NULL DEFAULT 0, last_synced_at TEXT,
          sync_status TEXT NOT NULL DEFAULT 'idle', last_error TEXT, orphaned_at TEXT,
          purge_after TEXT, purge_warned_at TEXT, ever_linked INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
          PRIMARY KEY (owner_id, uid)
        );
        CREATE TABLE archive_account_sources (
          owner_id TEXT NOT NULL, uid TEXT NOT NULL, source TEXT NOT NULL,
          first_seen_at TEXT NOT NULL, last_seen_at TEXT NOT NULL,
          PRIMARY KEY (owner_id, uid, source),
          FOREIGN KEY (owner_id, uid) REFERENCES archive_accounts(owner_id, uid) ON DELETE CASCADE
        );
        CREATE TABLE gacha_records (
          owner_id TEXT NOT NULL, uid TEXT NOT NULL, source TEXT NOT NULL,
          source_rank INTEGER NOT NULL DEFAULT 0, gacha_type TEXT NOT NULL,
          channel_category TEXT NOT NULL DEFAULT 'unknown', banner_id TEXT, record_id TEXT NOT NULL,
          item_id TEXT NOT NULL, name TEXT NOT NULL, item_type TEXT NOT NULL, rarity TEXT NOT NULL,
          pulled_at TEXT NOT NULL, is_up INTEGER, first_saved_at TEXT NOT NULL,
          PRIMARY KEY (owner_id, uid, record_id),
          FOREIGN KEY (owner_id, uid) REFERENCES archive_accounts(owner_id, uid) ON DELETE CASCADE
        );
        CREATE TABLE gacha_record_sources (
          owner_id TEXT NOT NULL, uid TEXT NOT NULL, record_id TEXT NOT NULL, source TEXT NOT NULL,
          raw_banner_id TEXT, first_seen_at TEXT NOT NULL,
          PRIMARY KEY (owner_id, uid, record_id, source),
          FOREIGN KEY (owner_id, uid, record_id)
            REFERENCES gacha_records(owner_id, uid, record_id) ON DELETE CASCADE
        );
      `);
      this.db.exec(`
        INSERT INTO archive_accounts
        SELECT owner_id, uid,
          COALESCE(MAX(NULLIF(region, '')), ''), MAX(weekly_enabled), MAX(last_synced_at),
          CASE WHEN MAX(CASE sync_status WHEN 'ok' THEN 2 WHEN 'failed' THEN 1 ELSE 0 END) = 2 THEN 'ok'
               WHEN MAX(CASE sync_status WHEN 'ok' THEN 2 WHEN 'failed' THEN 1 ELSE 0 END) = 1 THEN 'failed' ELSE 'idle' END,
          MAX(last_error), MIN(orphaned_at), MIN(purge_after), MIN(purge_warned_at), MAX(ever_linked),
          MIN(created_at), MAX(updated_at)
        FROM archive_accounts_legacy_v1 GROUP BY owner_id, uid;
        INSERT INTO archive_account_sources
        SELECT owner_id, uid, source, MIN(created_at), MAX(updated_at)
        FROM archive_accounts_legacy_v1 GROUP BY owner_id, uid, source;
      `);
      const legacyRecordColumns = this.tableColumns("gacha_records_legacy_v1");
      const category = legacyRecordColumns.has("channel_category") ? "channel_category" : "'unknown'";
      const banner = legacyRecordColumns.has("banner_id") ? "banner_id" : "NULL";
      const isUp = legacyRecordColumns.has("is_up") ? "is_up" : "NULL";
      this.db.exec(`
        INSERT OR IGNORE INTO gacha_records
        SELECT owner_id, uid, source, CASE source WHEN 'official' THEN 3 WHEN 'manual' THEN 2 ELSE 1 END,
          gacha_type, ${category}, ${banner}, record_id, item_id, name, item_type, rarity,
          pulled_at, ${isUp}, first_saved_at
        FROM gacha_records_legacy_v1
        ORDER BY CASE source WHEN 'official' THEN 3 WHEN 'manual' THEN 2 ELSE 1 END DESC;
        INSERT OR IGNORE INTO gacha_record_sources
        SELECT owner_id, uid, record_id, source, ${banner}, first_saved_at FROM gacha_records_legacy_v1;
      `);
      // A legacy fixture may not have had its account row created correctly.
      this.db.prepare(`
        INSERT OR IGNORE INTO archive_accounts
        SELECT owner_id, uid, '', 0, NULL, 'idle', NULL, NULL, NULL, NULL, 0, ?, ?
        FROM gacha_records GROUP BY owner_id, uid
      `).run(now, now);
      this.db.prepare(`
        INSERT OR IGNORE INTO archive_account_sources
        SELECT owner_id, uid, source, MIN(first_seen_at), MAX(first_seen_at)
        FROM gacha_record_sources GROUP BY owner_id, uid, source
      `).run();

      const expectedRecords = Number((this.db.prepare(`
        SELECT COUNT(*) AS count FROM (
          SELECT 1 FROM gacha_records_legacy_v1 GROUP BY owner_id, uid, record_id
        )
      `).get() as { count: number }).count);
      const actualRecords = Number((this.db.prepare(
        "SELECT COUNT(*) AS count FROM gacha_records",
      ).get() as { count: number }).count);
      const expectedSources = Number((this.db.prepare(
        "SELECT COUNT(*) AS count FROM gacha_records_legacy_v1",
      ).get() as { count: number }).count);
      const actualSources = Number((this.db.prepare(
        "SELECT COUNT(*) AS count FROM gacha_record_sources",
      ).get() as { count: number }).count);
      if (actualRecords !== expectedRecords || actualSources !== expectedSources) {
        throw new Error(
          `調頻封存 migration 筆數不一致：records ${actualRecords}/${expectedRecords}, sources ${actualSources}/${expectedSources}`,
        );
      }
      const violations = this.db.pragma("foreign_key_check") as unknown[];
      if (violations.length) {
        throw new Error(`調頻封存 migration 外鍵檢查失敗：${violations.length} 筆`);
      }
    });
    try {
      migrate();
    } finally {
      this.db.pragma("foreign_keys = ON");
    }
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
    const transaction = this.db.transaction(() => {
      this.db.prepare(`
      INSERT INTO archive_accounts (
        owner_id, uid, region, ever_linked, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(owner_id, uid) DO UPDATE SET
        region = CASE WHEN excluded.region <> '' THEN excluded.region ELSE region END,
        ever_linked = MAX(ever_linked, excluded.ever_linked),
        updated_at = excluded.updated_at
    `).run(
      input.ownerId,
      input.uid,
      input.region ?? "",
      input.everLinked ? 1 : 0,
      now,
      now,
    );
      this.db.prepare(`
        INSERT INTO archive_account_sources (owner_id, uid, source, first_seen_at, last_seen_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(owner_id, uid, source) DO UPDATE SET last_seen_at = excluded.last_seen_at
      `).run(input.ownerId, input.uid, input.source, now, now);
    });
    transaction();
    return this.getAccount(input.ownerId, input.uid, input.source)!;
  }

  getAccount(ownerId: string, uid: string, source?: GachaArchiveSource): GachaArchiveAccount | null {
    const params: string[] = [ownerId, uid];
    const filter = source
      ? " AND EXISTS (SELECT 1 FROM archive_account_sources s WHERE s.owner_id = a.owner_id AND s.uid = a.uid AND s.source = ?)"
      : "";
    if (source) params.push(source);
    const row = this.db.prepare(`
      SELECT a.*, (SELECT GROUP_CONCAT(source) FROM archive_account_sources s
        WHERE s.owner_id = a.owner_id AND s.uid = a.uid) AS sources
      FROM archive_accounts a WHERE owner_id = ? AND uid = ?${filter}
    `).get(...params) as Record<string, unknown> | undefined;
    return row ? this.mapAccount(row, source) : null;
  }

  listAccounts(ownerId: string): GachaArchiveAccount[] {
    const rows = this.db.prepare(`
      SELECT a.*, (SELECT GROUP_CONCAT(source) FROM archive_account_sources s
        WHERE s.owner_id = a.owner_id AND s.uid = a.uid) AS sources
      FROM archive_accounts a WHERE owner_id = ? ORDER BY uid
    `).all(ownerId) as Record<string, unknown>[];
    return rows.map((row) => this.mapAccount(row));
  }

  listWeeklyDue(before: Date, limit = 100): GachaArchiveAccount[] {
    const rows = this.db.prepare(`
      SELECT * FROM archive_accounts
      WHERE weekly_enabled = 1 AND orphaned_at IS NULL
        AND (last_synced_at IS NULL OR last_synced_at <= ?)
      ORDER BY COALESCE(last_synced_at, '') ASC
      LIMIT ?
    `).all(iso(before), Math.max(1, Math.min(limit, 1000))) as Record<string, unknown>[];
    return rows.map((row) => this.mapAccount(row));
  }

  addRecords(records: GachaArchiveRecord[]): number {
    return this.mergeRecords(records).sourceAdded;
  }

  mergeRecords(records: GachaArchiveRecord[]): GachaMergeResult {
    if (records.length === 0) return { inserted: 0, duplicates: 0, conflicts: 0, sourceAdded: 0 };
    const result: GachaMergeResult = { inserted: 0, duplicates: 0, conflicts: 0, sourceAdded: 0 };
    const select = this.db.prepare(`SELECT * FROM gacha_records WHERE owner_id = ? AND uid = ? AND record_id = ?`);
    const insert = this.db.prepare(`INSERT INTO gacha_records (
      owner_id, uid, source, source_rank, gacha_type, channel_category, banner_id, record_id,
      item_id, name, item_type, rarity, pulled_at, is_up, first_saved_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(owner_id, uid, record_id) DO UPDATE SET
      source = CASE WHEN excluded.source_rank > source_rank THEN excluded.source ELSE source END,
      source_rank = MAX(source_rank, excluded.source_rank),
      gacha_type = CASE WHEN excluded.source_rank > source_rank OR gacha_type = '' THEN excluded.gacha_type ELSE gacha_type END,
      channel_category = CASE WHEN excluded.source_rank > source_rank OR channel_category = 'unknown' THEN excluded.channel_category ELSE channel_category END,
      banner_id = CASE WHEN excluded.source_rank > source_rank THEN COALESCE(excluded.banner_id, banner_id) ELSE COALESCE(banner_id, excluded.banner_id) END,
      item_id = CASE WHEN excluded.source_rank > source_rank OR item_id = '' THEN excluded.item_id ELSE item_id END,
      name = CASE WHEN excluded.source_rank > source_rank OR name = '' THEN excluded.name ELSE name END,
      item_type = CASE WHEN excluded.source_rank > source_rank OR item_type = '' THEN excluded.item_type ELSE item_type END,
      rarity = CASE WHEN excluded.source_rank > source_rank OR rarity = '' THEN excluded.rarity ELSE rarity END,
      pulled_at = CASE WHEN excluded.source_rank > source_rank THEN excluded.pulled_at ELSE pulled_at END,
      is_up = CASE WHEN excluded.source_rank > source_rank THEN COALESCE(excluded.is_up, is_up) ELSE COALESCE(is_up, excluded.is_up) END`);
    const insertSource = this.db.prepare(`
      INSERT OR IGNORE INTO gacha_record_sources
        (owner_id, uid, record_id, source, raw_banner_id, first_seen_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const transaction = this.db.transaction((items: GachaArchiveRecord[]) => {
      for (const record of items) {
        this.upsertAccount({
          ownerId: record.ownerId,
          uid: record.uid,
          source: record.source,
        });
        const existing = select.get(record.ownerId, record.uid, record.recordId) as Record<string, unknown> | undefined;
        if (existing) {
          result.duplicates++;
          if (["item_id", "pulled_at", "channel_category"].some((key) => {
            const incoming = key === "item_id" ? record.itemId
              : key === "pulled_at" ? record.pulledAt : record.channelCategory ?? "unknown";
            const current = String(existing[key] ?? "");
            return current && incoming && current !== incoming;
          })) result.conflicts++;
        } else {
          result.inserted++;
        }
        const rank = sourceRank(record.source);
        insert.run(
          record.ownerId,
          record.uid,
          record.source,
          rank,
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
        result.sourceAdded += insertSource.run(
          record.ownerId, record.uid, record.recordId, record.source,
          record.bannerId || null, record.firstSavedAt ?? iso(),
        ).changes;
      }
    });
    transaction(records);
    return result;
  }

  listRecords(query: ArchiveRecordQuery): GachaArchiveRecord[] {
    const limit = Math.max(1, Math.min(query.limit ?? 50, 200));
    const offset = Math.max(0, query.offset ?? 0);
    const params: Array<string | number> = [query.ownerId, query.uid];
    let filter = "";
    if (query.source) {
      filter += " AND EXISTS (SELECT 1 FROM gacha_record_sources rs WHERE rs.owner_id = gacha_records.owner_id AND rs.uid = gacha_records.uid AND rs.record_id = gacha_records.record_id AND rs.source = ?)";
      params.push(query.source);
    }
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
    params.push(limit, offset);
    const rows = this.db.prepare(`
      SELECT * FROM gacha_records
      WHERE owner_id = ? AND uid = ?${filter}
      ORDER BY pulled_at DESC, record_id DESC
      LIMIT ? OFFSET ?
    `).all(...params) as Record<string, unknown>[];
    return rows.map((row) => this.mapRecord(row));
  }

  countRecords(query: Omit<ArchiveRecordQuery, "limit" | "offset">): number {
    const params: string[] = [query.ownerId, query.uid];
    let filter = "";
    if (query.source) {
      filter += " AND EXISTS (SELECT 1 FROM gacha_record_sources rs WHERE rs.owner_id = gacha_records.owner_id AND rs.uid = gacha_records.uid AND rs.record_id = gacha_records.record_id AND rs.source = ?)";
      params.push(query.source);
    }
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
    const row = this.db.prepare(`
      SELECT COUNT(*) AS count FROM gacha_records
      WHERE owner_id = ? AND uid = ?${filter}
    `).get(...params) as { count: number };
    return Number(row.count);
  }

  listTimeline(query: Omit<ArchiveRecordQuery, "limit" | "offset">): GachaArchiveRecord[] {
    const params: string[] = [query.ownerId, query.uid];
    let filter = "";
    if (query.source) {
      filter += " AND EXISTS (SELECT 1 FROM gacha_record_sources rs WHERE rs.owner_id = gacha_records.owner_id AND rs.uid = gacha_records.uid AND rs.record_id = gacha_records.record_id AND rs.source = ?)";
      params.push(query.source);
    }
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
      WHERE owner_id = ? AND uid = ?${filter}
      ORDER BY pulled_at ASC, record_id ASC
    `).all(...params) as Record<string, unknown>[];
    return rows.map((row) => this.mapRecord(row));
  }

  setWeeklyEnabled(ownerId: string, uid: string, enabled: boolean): void {
    this.db.prepare(`
      UPDATE archive_accounts SET weekly_enabled = ?, updated_at = ?
      WHERE owner_id = ? AND uid = ?
    `).run(enabled ? 1 : 0, iso(), ownerId, uid);
  }

  getOfficialSyncBoundary(ownerId: string, uid: string, gachaType: string): string | null {
    const row = this.db.prepare(`SELECT newest_record_id FROM official_sync_state
      WHERE owner_id = ? AND uid = ? AND gacha_type = ?`)
      .get(ownerId, uid, gachaType) as { newest_record_id?: string } | undefined;
    return row?.newest_record_id ? String(row.newest_record_id) : null;
  }

  setOfficialSyncBoundary(ownerId: string, uid: string, gachaType: string, recordId: string): void {
    if (!recordId) return;
    this.db.prepare(`INSERT INTO official_sync_state
      (owner_id, uid, gacha_type, newest_record_id, completed_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(owner_id, uid, gacha_type) DO UPDATE SET
        newest_record_id = excluded.newest_record_id, completed_at = excluded.completed_at`)
      .run(ownerId, uid, gachaType, recordId, iso());
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
    source?: GachaArchiveSource;
    channelCategory?: GachaChannelCategory;
  }): GachaArchiveBanner[] {
    const params: string[] = [input.ownerId, input.uid];
    let filter = input.source ? " AND source = ?" : "";
    if (input.source) params.push(input.source);
    filter += input.channelCategory ? " AND channel_category = ?" : "";
    if (input.channelCategory) params.push(input.channelCategory);
    const rows = this.db.prepare(`
      SELECT * FROM gacha_banners
      WHERE owner_id = ? AND uid = ?${filter}
      ORDER BY COALESCE(start_at, '') DESC,
        CASE source WHEN 'official' THEN 3 WHEN 'manual' THEN 2 ELSE 1 END DESC,
        banner_id DESC
    `).all(...params) as Record<string, unknown>[];
    const seen = new Set<string>();
    return rows.filter((row) => {
      const key = `${String(row.channel_category)}:${String(row.banner_id)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).map((row) => this.mapBanner(row));
  }

  classifyUnresolvedBannerRecords(input: {
    ownerId: string;
    uid: string;
    source: GachaArchiveSource;
  }): number {
    const records = this.db.prepare(`
      SELECT record_id, channel_category, pulled_at
      FROM gacha_records
      WHERE owner_id = ? AND uid = ?
        AND (banner_id IS NULL OR banner_id = '' OR banner_id = '0')
    `).all(input.ownerId, input.uid) as Array<{
      record_id: string;
      channel_category: string;
      pulled_at: string;
    }>;
    const banners = this.listBanners({ ownerId: input.ownerId, uid: input.uid })
      .filter((banner) => banner.startAt && banner.endAt);
    const update = this.db.prepare(`
      UPDATE gacha_records SET banner_id = ?
      WHERE owner_id = ? AND uid = ? AND record_id = ?
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
        view, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        view = excluded.view,
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
      input.source ?? "official",
      input.category,
      input.bannerId,
      input.bannerPage,
      input.page,
      input.stale ? 1 : 0,
      normalizeSignalLogView(input.view),
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
      source: (String(row.source || "official")) as GachaArchiveSource,
      category: String(row.category ?? "character_up") as GachaChannelCategory,
      bannerId: row.banner_id ? String(row.banner_id) : null,
      bannerPage: Math.max(0, Number(row.banner_page) || 0),
      page: Math.max(0, Number(row.page) || 0),
      stale: bool(row.stale),
      view: normalizeSignalLogView(row.view),
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
      WHERE owner_id = ? AND uid = ?
        AND channel_category = 'bangboo'
        AND UPPER(rarity) IN ('S', '4', '5')
        AND (is_up IS NULL OR is_up <> 1)
    `).run(input.ownerId, input.uid).changes;
    const rows = this.db.prepare(`
      SELECT * FROM gacha_records
      WHERE owner_id = ? AND uid = ? AND is_up IS NULL
    `).all(input.ownerId, input.uid) as Record<string, unknown>[];
    const records = rows.map((row) => this.mapRecord(row));
    const periodsByCategory = new Map<GachaChannelCategory, GachaUpPeriod[]>();
    const update = this.db.prepare(`
      UPDATE gacha_records SET is_up = ?
      WHERE owner_id = ? AND uid = ? AND record_id = ? AND is_up IS NULL
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
          input.ownerId, input.uid, record.recordId,
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
      WHERE owner_id = ? AND uid = ?
    `).run(iso(at), iso(at), ownerId, uid);
  }

  recordSyncFailure(ownerId: string, uid: string, source: GachaArchiveSource, error: unknown): void {
    this.db.prepare(`
      UPDATE archive_accounts SET sync_status = 'failed', last_error = ?, updated_at = ?
      WHERE owner_id = ? AND uid = ?
    `).run(cleanError(error), iso(), ownerId, uid);
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
      WHERE owner_id = ? AND uid = ?
    `).run(iso(at), iso(at), ownerId, uid);
  }

  purgeExpired(now = new Date()): number {
    return this.db.prepare(`
      DELETE FROM archive_accounts WHERE purge_after IS NOT NULL AND purge_after <= ?
    `).run(iso(now)).changes;
  }

  clear(ownerId: string, uid: string, source?: GachaArchiveSource): number {
    if (source) {
      const transaction = this.db.transaction(() => {
        const removed = this.db.prepare(`DELETE FROM gacha_record_sources
          WHERE owner_id = ? AND uid = ? AND source = ?`).run(ownerId, uid, source).changes;
        this.db.prepare(`DELETE FROM gacha_records WHERE owner_id = ? AND uid = ? AND NOT EXISTS (
          SELECT 1 FROM gacha_record_sources rs WHERE rs.owner_id = gacha_records.owner_id
            AND rs.uid = gacha_records.uid AND rs.record_id = gacha_records.record_id
        )`).run(ownerId, uid);
        this.db.prepare("DELETE FROM gacha_banners WHERE owner_id = ? AND uid = ? AND source = ?")
          .run(ownerId, uid, source);
        const accountSourceRemoved = this.db.prepare(
          "DELETE FROM archive_account_sources WHERE owner_id = ? AND uid = ? AND source = ?",
        ).run(ownerId, uid, source).changes;
        this.db.prepare(`DELETE FROM archive_accounts WHERE owner_id = ? AND uid = ? AND NOT EXISTS (
          SELECT 1 FROM archive_account_sources s WHERE s.owner_id = archive_accounts.owner_id
            AND s.uid = archive_accounts.uid
        )`).run(ownerId, uid);
        return Math.max(removed, accountSourceRemoved);
      });
      return transaction();
    }
    return this.db.prepare(`
      DELETE FROM archive_accounts WHERE owner_id = ? AND uid = ?
    `).run(ownerId, uid).changes;
  }

  private mapAccount(row: Record<string, unknown>, requestedSource?: GachaArchiveSource): GachaArchiveAccount {
    const sources = String(row.sources ?? row.source ?? "official").split(",")
      .filter(Boolean) as GachaArchiveSource[];
    return {
      ownerId: String(row.owner_id),
      uid: String(row.uid),
      region: String(row.region ?? ""),
      source: requestedSource ?? (sources.includes("official") ? "official" : sources[0] ?? "official"),
      weeklyEnabled: bool(row.weekly_enabled),
      lastSyncedAt: row.last_synced_at ? String(row.last_synced_at) : null,
      syncStatus: String(row.sync_status) as GachaArchiveAccount["syncStatus"],
      lastError: row.last_error ? String(row.last_error) : null,
      orphanedAt: row.orphaned_at ? String(row.orphaned_at) : null,
      purgeAfter: row.purge_after ? String(row.purge_after) : null,
      purgeWarnedAt: row.purge_warned_at ? String(row.purge_warned_at) : null,
      everLinked: bool(row.ever_linked),
      sources,
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

function sourceRank(source: GachaArchiveSource): number {
  if (source === "official") return 3;
  if (source === "manual") return 2;
  return 1;
}

let singleton: GachaArchiveStore | null = null;

export function getGachaArchiveStore(): GachaArchiveStore {
  singleton ??= new GachaArchiveStore(process.env.ZZZ_GACHA_ARCHIVE_PATH);
  return singleton;
}
