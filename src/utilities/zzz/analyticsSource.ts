import axios from "axios";

export const ANALYTICS_URL = "https://zzz.analytics.moe";
export type ReferenceActor = {
  id: string;
  name: string;
  damage: number;
  equipment: Record<string, string>;
  substats: Record<string, number>;
};
export type ReferenceRun = {
  id: string;
  date: string;
  dps: number;
  duration: number;
  damage: number;
  actors: ReferenceActor[];
  events: { name: string; actor: string; damage: number }[];
  video?: string;
  hasLog: boolean;
};
export type ReferenceSnapshot = {
  runs: ReferenceRun[];
  fetchedAt: number;
  stale: boolean;
};

const text = (value: unknown) =>
  typeof value === "string" ? value.slice(0, 160) : "";
const positive = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

export function safeVideo(value: unknown): string | undefined {
  try {
    const url = new URL(String(value));
    if (
      url.protocol === "https:" &&
      ["youtu.be", "youtube.com", "www.youtube.com"].includes(url.hostname)
    )
      return url.href;
  } catch {
    /* No video. */
  }
  return undefined;
}

export function parseReferenceRuns(payload: unknown): ReferenceRun[] {
  if (
    !payload ||
    typeof payload !== "object" ||
    !Array.isArray((payload as any).runs)
  )
    throw new Error("Invalid analytics snapshot");
  const result: ReferenceRun[] = [];
  const seen = new Set<string>();
  for (const run of (payload as any).runs) {
    // This is the site's public snapshot, not its moderation queue. Its public
    // rows can retain status=pending; do not infer approval from that field.
    if (
      !run ||
      run.is_beta_archived ||
      run.beta_revision ||
      run.beta_archive?.is_archived ||
      run.beta_archive?.version ||
      run.needs_improvement
    )
      continue;
    if (
      !/^run_[\w-]{1,100}$/.test(run.id) ||
      seen.has(run.id) ||
      !positive(run.dps) ||
      !positive(run.duration_sec) ||
      run.duration_sec === 0 ||
      !positive(run.total_damage)
    )
      continue;
    if (
      !Array.isArray(run.actors) ||
      run.actors.length < 1 ||
      run.actors.length > 3
    )
      continue;
    const actors: ReferenceActor[] = [];
    for (const actor of run.actors) {
      if (
        !actor ||
        !/^\d{4,8}$/.test(String(actor.attacker_id)) ||
        !text(actor.agent_name) ||
        !positive(actor.damage_dealt)
      )
        break;
      const equipment: Record<string, string> = {};
      for (const key of [
        "mindscape",
        "phase",
        "w_engine",
        "disc_2pc",
        "disc_4pc",
        "slot4",
        "slot5",
        "slot6",
      ])
        equipment[key] = text(actor.equipment?.[key]);
      const substats: Record<string, number> = {};
      for (const [key, value] of Object.entries(
        actor.equipment?.substats ?? {},
      )) {
        if (/^[a-z_]{1,24}$/.test(key) && positive(value))
          substats[key] = value;
      }
      actors.push({
        id: String(actor.attacker_id),
        name: text(actor.agent_name),
        damage: actor.damage_dealt,
        equipment,
        substats,
      });
    }
    if (
      actors.length !== run.actors.length ||
      new Set(actors.map((a) => a.id)).size !== actors.length
    )
      continue;
    const events = (Array.isArray(run.events) ? run.events : [])
      .filter((e: any) => e && positive(e.damage))
      .map((e: any) => ({
        name: text(e.skill_name),
        actor: text(e.agent_name),
        damage: e.damage as number,
      }))
      .sort((a: any, b: any) => b.damage - a.damage)
      .slice(0, 8);
    result.push({
      id: run.id,
      date: text(run.date),
      dps: run.dps,
      duration: run.duration_sec,
      damage: run.total_damage,
      actors,
      events,
      video: safeVideo(run.youtube_url),
      hasLog: Boolean(run.combat_log_url),
    });
    seen.add(run.id);
  }
  return result;
}

export function matchReferenceRuns(
  runs: ReferenceRun[],
  selected: string[],
  owned?: string[],
) {
  const roster = owned ? new Set(owned) : undefined;
  return runs
    .filter(
      (run) =>
        selected.every((id) => run.actors.some((a) => a.id === id)) &&
        (!roster || run.actors.every((a) => roster.has(a.id))),
    )
    .sort((a, b) => b.dps - a.dps || a.id.localeCompare(b.id));
}

export class AnalyticsSource {
  private snapshot?: ReferenceSnapshot;
  private inflight?: Promise<ReferenceSnapshot>;
  private retryAfter = 0;
  constructor(
    private fetchPayload: () => Promise<unknown> = async () =>
      (
        await axios.get(`${ANALYTICS_URL}/api/runs`, {
          timeout: 12_000,
          maxContentLength: 20 * 1024 * 1024,
          maxRedirects: 0,
        })
      ).data,
    private now = Date.now,
  ) {}
  async get(): Promise<ReferenceSnapshot> {
    const age = this.snapshot ? this.now() - this.snapshot.fetchedAt : Infinity;
    if (this.snapshot && age < 60 * 60_000)
      return { ...this.snapshot, stale: false };
    if (this.now() < this.retryAfter) {
      if (this.snapshot && age < 24 * 60 * 60_000)
        return { ...this.snapshot, stale: true };
      throw new Error("Analytics temporarily unavailable");
    }
    if (!this.inflight) {
      this.inflight = this.fetchPayload()
        .then((payload) => {
          const runs = parseReferenceRuns(payload);
          this.snapshot = { runs, fetchedAt: this.now(), stale: false };
          return this.snapshot;
        })
        .catch((error) => {
          this.retryAfter = this.now() + 60_000;
          if (
            this.snapshot &&
            this.now() - this.snapshot.fetchedAt < 24 * 60 * 60_000
          )
            return { ...this.snapshot, stale: true };
          throw error;
        })
        .finally(() => {
          this.inflight = undefined;
        });
    }
    return this.inflight;
  }
}

export const analyticsSource = new AnalyticsSource();
