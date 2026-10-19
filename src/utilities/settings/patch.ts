/** Merge only the edited field group. Serialize in-process reads/writes per key. */
const locks = new Map<string, Promise<unknown>>();
export async function saveSettingGroup<T extends object>(
  db: { get(key: string): any; set(key: string, value: any): any }, key: string,
  baseline: T, draft: T, fields: readonly (keyof T)[], normalize: (raw: unknown) => T,
): Promise<T> {
  const previous = locks.get(key) || Promise.resolve();
  const work = previous.catch(() => {}).then(async () => {
    const current = normalize(await db.get(key));
    for (const field of fields) if (JSON.stringify(current[field]) !== JSON.stringify(baseline[field])) throw new Error("settings_conflict");
    const next = { ...current };
    for (const field of fields) { if (draft[field] === undefined) delete next[field]; else next[field] = draft[field]; }
    await db.set(key, next); return next;
  });
  locks.set(key, work);
  try { return await work; } finally { if (locks.get(key) === work) locks.delete(key); }
}
