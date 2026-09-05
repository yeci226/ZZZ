import { createHash } from "node:crypto";

import { clearLegacyInvalidProbe } from "./core/dailyAuthState.js";

/**
 * Mirrors the helper in web-login/app/api/login/email-verify/route.ts so
 * IDs computed bot-side match what the web app stored in Supabase.
 */
export function extractLtuidFromCookie(cookieStr: string): string | null {
	const m =
		cookieStr.match(/ltuid_v2=([^;\s]+)/i) ??
		cookieStr.match(/ltuid=([^;\s]+)/i);
	return m ? m[1]! : null;
}

/**
 * Deterministic placeholder ID for cookies whose ltuid we cannot parse.
 * Same cookie always yields the same bucket so legacy entries that
 * shared a broken cookie group together.
 */
export function fallbackBucketKey(cookieStr: string): string {
	const h = createHash("sha1").update(cookieStr).digest("hex").slice(0, 8);
	return `unknown-${h}`;
}

// ---------- Types ----------

export interface Character {
	[key: string]: unknown;
	uid: string;
	nickname: string | null;
	region: string | null;
	lastUpdate: string;
	invalid: boolean;
	// Plan C — optional rich fields populated from web-login enriched payload.
	// All optional so legacy characters (and rows where enrichment failed)
	// continue to round-trip without modification.
	level?: number;
	region_name?: string;
	cover?: string;
	logo?: string;
	game_name?: string;
	stats?: { name: string; value: string }[];
	enrichedAt?: string;
}

export interface Hoyolab {
	ltuid_v2: string;
	cookie: string;
	hoyolabName: string | null;
	lastUpdate: string;
	invalid: boolean;
	characters: Character[];
	/** Encrypted stoken for silent cookie refresh. Stored per Hoyolab account. */
	stoken?: string;
	/** ltmid_v2 required by exchangeStokenForCookies alongside ltuid_v2. */
	ltmid_v2?: string;
	/** Hoyolab profile picture URL fetched at web-login time. */
	hoyolabIcon?: string;
}

export interface AccountStore {
	hoyolabs: Hoyolab[];
}

export type AuthScope = "general" | "redeem";

export interface CookieWriteOptions {
	scope?: AuthScope;
}

/** Flat shape kept for old commands and old database entries. */
export interface LegacyAccount {
	[key: string]: unknown;
	uid: string;
	cookie: string;
	nickname?: string | null;
	lastUpdate?: string;
	invalid?: boolean;
}

/**
 * Subset of quick.db API the store relies on.
 *
 * `get` returns `T | null | undefined`: quick.db's real `get<T>()` returns
 * `T | null | undefined` (null for explicit deletes, undefined for missing
 * keys). `set` returns the stored value (quick.db's real signature is
 * `Promise<T>`), but we ignore it. Widening the return types here avoids
 * forcing every caller (notably the live `client.db`) through a
 * `... as unknown as DbAdapter` cast at the boundary. All consumers in
 * this file already treat results as falsy-on-miss / fire-and-forget, so
 * the runtime contract is unchanged.
 */
export interface DbAdapter {
	get<T = unknown>(key: string): Promise<T | null | undefined> | T | null | undefined;
	set<T = unknown>(key: string, value: T): Promise<unknown> | unknown;
	delete(key: string): Promise<unknown> | unknown;
	has(key: string): Promise<boolean> | boolean;
}

// ---------- Legacy shape ----------

type LegacyChar = Partial<LegacyAccount> & { uid?: string | number };

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value);
}

function nowIso() {
	return new Date().toISOString();
}

interface GachaArchiveBindingStore {
	markOrphaned(userId: string, uid: string): number;
	restoreLinked(userId: string, uid: string, region?: string): number;
	upsertAccount(input: {
		ownerId: string;
		uid: string;
		region?: string;
		source: "official";
		everLinked?: boolean;
	}): unknown;
	setWeeklyEnabled(userId: string, uid: string, enabled: boolean): void;
}

export function applyGachaArchiveBinding(
	operation: "orphan" | "restore",
	userId: string,
	uid: string,
	region: string,
	weeklyEnabled: boolean,
	archive: GachaArchiveBindingStore,
): void {
	if (operation === "orphan") {
		archive.markOrphaned(userId, uid);
		return;
	}
	archive.restoreLinked(userId, uid, region);
	if (!weeklyEnabled) return;
	archive.upsertAccount({
		ownerId: userId,
		uid,
		region,
		source: "official",
		everLinked: true,
	});
	archive.setWeeklyEnabled(userId, uid, true);
}

async function updateGachaArchiveBinding(
	operation: "orphan" | "restore",
	db: DbAdapter,
	userId: string,
	uid: string,
	region = "",
): Promise<void> {
	// Keep account binding usable even if the optional archive file is
	// temporarily unavailable. Archive lifecycle is best-effort here and is
	// also reconciled by the scheduled archive job.
	if (process.env.NODE_ENV === "test") return;
	try {
		const { getGachaArchiveStore } = await import("./zzz/gachaArchive.js");
		const archive = getGachaArchiveStore();
		applyGachaArchiveBinding(
			operation,
			userId,
			uid,
			region,
			(await db.get<boolean>(`${userId}.gachaWeeklyArchive`)) === true,
			archive,
		);
	} catch {
		// Never make unlink/relink fail because archive maintenance failed.
	}
}

function legacyFields(entry: LegacyChar): Record<string, unknown> {
	const { uid: _uid, cookie: _cookie, nickname: _nickname, lastUpdate: _lastUpdate, invalid: _invalid, ...rest } = entry;
	return rest;
}

function toCharacter(entry: LegacyChar, fallbackLastUpdate: string): Character {
	const lastUpdate = entry.lastUpdate || fallbackLastUpdate;
	return {
		...legacyFields(entry),
		uid: String(entry.uid ?? ""),
		nickname: entry.nickname ?? null,
		region: typeof entry.region === "string" ? entry.region : null,
		lastUpdate,
		invalid: entry.invalid === true,
	};
}

function toLegacyAccount(hoyolab: Hoyolab, character: Character): LegacyAccount {
	return {
		...character,
		uid: String(character.uid),
		cookie: hoyolab.cookie,
		nickname: character.nickname ?? null,
		lastUpdate: character.lastUpdate,
		invalid: character.invalid || hoyolab.invalid,
	};
}

function flattenAccounts(store: AccountStore): LegacyAccount[] {
	return store.hoyolabs.flatMap(hoyolab =>
		hoyolab.characters.map(character => toLegacyAccount(hoyolab, character)),
	);
}

function locateLegacyAccount(store: AccountStore, index: number) {
	if (!Number.isInteger(index) || index < 0) return null;
	let current = 0;
	for (const hoyolab of store.hoyolabs) {
		if (index < current + hoyolab.characters.length) {
			return { hoyolab, character: hoyolab.characters[index - current]! };
		}
		current += hoyolab.characters.length;
	}
	return null;
}

function mergeMissingLegacyFields(hoyolabs: Hoyolab[], legacy: LegacyChar[]): boolean {
	let changed = false;
	for (const entry of legacy) {
		const cookie = typeof entry.cookie === "string" ? entry.cookie : "";
		const ltuid = extractLtuidFromCookie(cookie);
		const hoyolab = hoyolabs.find(h =>
			(ltuid && h.ltuid_v2 === ltuid) || h.characters.some(c => String(c.uid) === String(entry.uid)),
		);
		const character = hoyolab?.characters.find(c => String(c.uid) === String(entry.uid));
		if (!hoyolab || !character) continue;
		for (const [key, value] of Object.entries(legacyFields(entry))) {
			if (!(key in character)) {
				character[key] = value;
				changed = true;
			}
		}
	}
	return changed;
}

// ---------- Lazy migration ----------

/**
 * Load (and lazily migrate) a Discord user's account store. Idempotent.
 *
 * - Prefer `<userId>.hoyolabs` as the canonical grouped store.
 * - If only `<userId>.account` exists, group by ltuid extracted from each
 *   cookie and write the canonical store while keeping the legacy mirror.
 * - If both exist, recover missing legacy-only fields without overwriting
 *   canonical values.
 */
export async function loadAccounts(
	db: DbAdapter,
	userId: string
): Promise<AccountStore> {
	const rawExisting = await db.get<unknown>(`${userId}.hoyolabs`);
	const existing = Array.isArray(rawExisting)
		? (rawExisting as Hoyolab[])
		: isRecord(rawExisting) && Array.isArray(rawExisting.hoyolabs)
			? (rawExisting.hoyolabs as Hoyolab[])
			: null;

	const legacy = (await db.get<LegacyChar[]>(`${userId}.account`)) as
		| LegacyChar[]
		| undefined;
	if (existing && existing.length > 0) {
		if (Array.isArray(legacy) && legacy.length > 0 && mergeMissingLegacyFields(existing, legacy)) {
			await db.set(`${userId}.hoyolabs`, existing);
			await syncLegacyMirror(db, userId, { hoyolabs: existing });
		}
		return { hoyolabs: existing };
	}
	if (!legacy || !Array.isArray(legacy) || legacy.length === 0) {
		return { hoyolabs: existing ?? [] };
	}

	const groups = new Map<string, { cookie: string; entries: LegacyChar[] }>();
	for (const entry of legacy) {
		const cookie = typeof entry.cookie === "string" ? entry.cookie : "";
		const id =
			extractLtuidFromCookie(cookie) ?? fallbackBucketKey(cookie || String(entry.uid ?? ""));
		const g = groups.get(id);
		if (g) g.entries.push(entry);
		else groups.set(id, { cookie, entries: [entry] });
	}

	const hoyolabs: Hoyolab[] = [];
	for (const [ltuid_v2, { cookie, entries }] of groups) {
		const fallbackLastUpdate = nowIso();
		const lastUpdate = entries
			.map(e => e.lastUpdate ?? "")
			.filter(Boolean)
			.sort()
			.pop() ?? new Date().toISOString();

		hoyolabs.push({
			ltuid_v2,
			cookie,
			hoyolabName: null,
			lastUpdate,
			invalid: entries.length > 0 && entries.every(e => e.invalid === true),
			characters: entries.map(e => toCharacter(e, fallbackLastUpdate))
		});
	}

	await db.set(`${userId}.hoyolabs`, hoyolabs);
	const migrated: AccountStore = { hoyolabs };
	// Keep the old key alive. Existing deployments still have commands and
	// scripts that read it, and the mirror also preserves unknown legacy fields.
	await syncLegacyMirror(db, userId, migrated);
	return migrated;
}

/**
 * Persist `store` and synchronously rewrite the legacy
 * `<userId>.account` flat array so that all 30+ existing direct
 * readers (`database.get(`${userId}.account`)`) continue to see
 * up-to-date data without needing to switch to the new API.
 *
 * Mirror shape keeps old fields and extra character fields, with the parent
 * cookie denormalized onto each legacy entry.
 */
export async function saveAccounts(
	db: DbAdapter,
	userId: string,
	store: AccountStore
): Promise<void> {
	await db.set(`${userId}.hoyolabs`, store.hoyolabs);
	await syncLegacyMirror(db, userId, store);
}

async function syncLegacyMirror(
	db: DbAdapter,
	userId: string,
	store: AccountStore
): Promise<void> {
	const flat = flattenAccounts(store);
	if (flat.length === 0) {
		await db.delete(`${userId}.account`);
	} else {
		await db.set(`${userId}.account`, flat);
	}
}

/** Read the old flat shape through the canonical store. */
export async function getLegacyAccounts(
	db: DbAdapter,
	userId: string,
): Promise<LegacyAccount[]> {
	return flattenAccounts(await loadAccounts(db, userId));
}

export async function getLegacyAccountAtIndex(
	db: DbAdapter,
	userId: string,
	index: number,
): Promise<LegacyAccount | null> {
	const store = await loadAccounts(db, userId);
	const found = locateLegacyAccount(store, index);
	return found ? toLegacyAccount(found.hoyolab, found.character) : null;
}

/** Update one old flat entry while keeping the grouped store and mirror in sync. */
export async function updateLegacyAccountAtIndex(
	db: DbAdapter,
	userId: string,
	index: number,
	patch: Partial<LegacyAccount>,
	options: CookieWriteOptions = {},
): Promise<LegacyAccount | null> {
	const store = await loadAccounts(db, userId);
	const found = locateLegacyAccount(store, index);
	if (!found) return null;

	const { uid, cookie, nickname, lastUpdate, invalid, ...extra } = patch;
	const scope = options.scope ?? "general";
	const resetDailyProbe =
	  scope === "general" && (cookie !== undefined || invalid === false);
	const dailyProbeAccountKey = found.hoyolab.ltuid_v2;
	const previousUid = found.character.uid;
	Object.assign(found.character, extra);
	if (uid !== undefined) found.character.uid = String(uid);
	if (nickname !== undefined) found.character.nickname = nickname;
	if (lastUpdate !== undefined) found.character.lastUpdate = lastUpdate;
	if (invalid !== undefined && scope === "general") {
		found.character.invalid = invalid === true;
	}
	if (cookie !== undefined) found.hoyolab.cookie = String(cookie);
	found.hoyolab.lastUpdate = nowIso();

	await saveAccounts(db, userId, store);
	if (uid !== undefined && String(uid) !== previousUid) {
		await updateGachaArchiveBinding("orphan", db, userId, previousUid);
		await updateGachaArchiveBinding(
			"restore",
			db,
			userId,
			String(uid),
			String(found.character.region ?? ""),
		);
	}
	if (resetDailyProbe) {
	  await clearLegacyInvalidProbe(db, userId, dailyProbeAccountKey);
	}
	return toLegacyAccount(found.hoyolab, found.character);
}

export async function deleteLegacyAccountAtIndex(
	db: DbAdapter,
	userId: string,
	index: number,
): Promise<LegacyAccount | null> {
	const store = await loadAccounts(db, userId);
	const found = locateLegacyAccount(store, index);
	if (!found) return null;
	const removed = toLegacyAccount(found.hoyolab, found.character);
	found.hoyolab.characters.splice(found.hoyolab.characters.indexOf(found.character), 1);
	store.hoyolabs = store.hoyolabs.filter(h => h.characters.length > 0);
	await saveAccounts(db, userId, store);
	await updateGachaArchiveBinding("orphan", db, userId, removed.uid);
	return removed;
}

// ---------- Reads ----------

export async function getHoyolabs(
	db: DbAdapter,
	userId: string
): Promise<Hoyolab[]> {
	const store = await loadAccounts(db, userId);
	return store.hoyolabs;
}

export async function getHoyolabByLtuid(
	db: DbAdapter,
	userId: string,
	ltuid_v2: string
): Promise<Hoyolab | null> {
	const hs = await getHoyolabs(db, userId);
	return hs.find(h => h.ltuid_v2 === ltuid_v2) ?? null;
}

export async function getAllCharacters(
	db: DbAdapter,
	userId: string
): Promise<Array<Character & { ltuid_v2: string; cookie: string }>> {
	const hs = await getHoyolabs(db, userId);
	const out: Array<Character & { ltuid_v2: string; cookie: string }> = [];
	for (const h of hs) {
		for (const c of h.characters) {
			out.push({
				...c,
				invalid: h.invalid || c.invalid,
				ltuid_v2: h.ltuid_v2,
				cookie: h.cookie,
			});
		}
	}
	return out;
}

export async function getCharacter(
	db: DbAdapter,
	userId: string,
	uid: string
): Promise<{ character: Character; hoyolab: Hoyolab } | null> {
	const hs = await getHoyolabs(db, userId);
	for (const h of hs) {
		const c = h.characters.find(ch => ch.uid === String(uid));
		if (c) return { character: c, hoyolab: h };
	}
	return null;
}
// ---------- Writes ----------

export async function upsertHoyolab(
	db: DbAdapter,
	userId: string,
	patch: { ltuid_v2: string; cookie: string; hoyolabName?: string | null; stoken?: string; ltmid_v2?: string; hoyolabIcon?: string },
	options: CookieWriteOptions = {},
): Promise<Hoyolab> {
	const store = await loadAccounts(db, userId);
	const idx = store.hoyolabs.findIndex(h => h.ltuid_v2 === patch.ltuid_v2);
	const scope = options.scope ?? "general";
	let h: Hoyolab;
	if (idx === -1) {
		h = {
			ltuid_v2: patch.ltuid_v2,
			cookie: patch.cookie,
			hoyolabName: patch.hoyolabName ?? null,
			lastUpdate: nowIso(),
			invalid: false,
			characters: [],
			...(patch.stoken !== undefined && { stoken: patch.stoken }),
			...(patch.ltmid_v2 !== undefined && { ltmid_v2: patch.ltmid_v2 }),
			...(patch.hoyolabIcon !== undefined && { hoyolabIcon: patch.hoyolabIcon }),
		};
		store.hoyolabs.push(h);
	} else {
		h = store.hoyolabs[idx]!;
		h.cookie = patch.cookie;
		if (scope === "general") h.invalid = false;
		h.lastUpdate = nowIso();
		if (patch.hoyolabName !== undefined) h.hoyolabName = patch.hoyolabName;
		if (patch.stoken !== undefined) h.stoken = patch.stoken;
		if (patch.ltmid_v2 !== undefined) h.ltmid_v2 = patch.ltmid_v2;
		if (patch.hoyolabIcon !== undefined) h.hoyolabIcon = patch.hoyolabIcon;
	}
	await saveAccounts(db, userId, store);
	if (scope === "general") {
	  await clearLegacyInvalidProbe(db, userId, patch.ltuid_v2);
	}
	return h;
}

export async function upsertCharacter(
	db: DbAdapter,
	userId: string,
	ltuid_v2: string,
	character: Character
): Promise<void> {
	const store = await loadAccounts(db, userId);
	const h = store.hoyolabs.find(x => x.ltuid_v2 === ltuid_v2);
	if (!h) {
		throw new Error(
			`upsertCharacter: hoyolab ltuid_v2=${ltuid_v2} not found for user=${userId}`
		);
	}
	const i = h.characters.findIndex(c => c.uid === character.uid);
	if (i === -1) h.characters.push(character);
	else h.characters[i] = { ...h.characters[i], ...character };
	h.lastUpdate = nowIso();
	await saveAccounts(db, userId, store);
	await updateGachaArchiveBinding(
		"restore",
		db,
		userId,
		character.uid,
		String(character.region ?? ""),
	);
}

export async function removeHoyolab(
	db: DbAdapter,
	userId: string,
	ltuid_v2: string
): Promise<void> {
	const store = await loadAccounts(db, userId);
	const removed = store.hoyolabs.find(h => h.ltuid_v2 === ltuid_v2);
	store.hoyolabs = store.hoyolabs.filter(h => h.ltuid_v2 !== ltuid_v2);
	await saveAccounts(db, userId, store);
	for (const character of removed?.characters ?? []) {
		await updateGachaArchiveBinding("orphan", db, userId, character.uid);
	}
}

export async function markCharacterInvalid(
	db: DbAdapter,
	userId: string,
	uid: string,
	invalid: boolean
): Promise<void> {
	const store = await loadAccounts(db, userId);
	for (const h of store.hoyolabs) {
		const c = h.characters.find(ch => ch.uid === String(uid));
		if (c) {
			c.invalid = invalid;
			await saveAccounts(db, userId, store);
			return;
		}
	}
}

export async function markHoyolabInvalid(
	db: DbAdapter,
	userId: string,
	ltuid_v2: string,
	invalid: boolean
): Promise<void> {
	const store = await loadAccounts(db, userId);
	const h = store.hoyolabs.find(x => x.ltuid_v2 === ltuid_v2);
	if (!h) return;
	h.invalid = invalid;
	await saveAccounts(db, userId, store);
}

async function setGeneralValidity(
	db: DbAdapter,
	userId: string,
	uid: string,
	valid: boolean,
): Promise<void> {
	const store = await loadAccounts(db, userId);
	for (const h of store.hoyolabs) {
		const character = h.characters.find(c => c.uid === String(uid));
		if (!character) continue;
		h.invalid = !valid;
		character.invalid = !valid;
		await saveAccounts(db, userId, store);
		return;
	}
}

export async function restoreGeneralValidity(
	db: DbAdapter,
	userId: string,
	uid: string,
): Promise<void> {
	await setGeneralValidity(db, userId, uid, true);
}

export async function markGeneralInvalid(
	db: DbAdapter,
	userId: string,
	uid: string,
): Promise<void> {
	await setGeneralValidity(db, userId, uid, false);
}

/**
 * Set hoyolabName only if it is currently null. Best-effort backfill from
 * opportunistic API calls (e.g. during daily check). No-op if the name
 * is already set, so manual edits (when added later) are not clobbered.
 */
export async function backfillHoyolabName(
	db: DbAdapter,
	userId: string,
	ltuid_v2: string,
	name: string
): Promise<void> {
	const store = await loadAccounts(db, userId);
	const h = store.hoyolabs.find(x => x.ltuid_v2 === ltuid_v2);
	if (!h || h.hoyolabName != null) return;
	h.hoyolabName = name;
	await saveAccounts(db, userId, store);
}
