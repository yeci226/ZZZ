export type MainTab = "all" | "guild" | "mine";
export type SubTab = "all" | "featured" | "help";

export interface IkState {
  main: MainTab;
  sub: SubTab;
  page: number;
  postId?: number;
  cpage?: number;
  expanded?: boolean;
  last?: number;
}

const MAINS: MainTab[] = ["all", "guild", "mine"];
const SUBS: SubTab[] = ["all", "featured", "help"];
const num = (n?: number) => (n === undefined ? "" : n.toString(36));

/** Format: `ik:<action>:<main>.<sub>.<page>.<postId>.<cpage>.<expanded>.<last>`, numbers in base36. */
export function encodeIkId(action: string, s: IkState): string {
  const fields = [s.main, s.sub, num(s.page), num(s.postId), num(s.cpage), s.expanded ? "1" : "", num(s.last)];
  return `ik:${action}:${fields.join(".")}`;
}

export function decodeIkId(id: string): { action: string; state: IkState } | null {
  const [prefix, action, payload, ...rest] = id.split(":");
  if (prefix !== "ik" || !action || payload === undefined || rest.length) return null;
  const [main, sub, page, postId, cpage, expanded, last] = payload.split(".");
  if (!MAINS.includes(main as MainTab) || !SUBS.includes(sub as SubTab)) return null;
  const parse = (v?: string) => (v ? Number.parseInt(v, 36) : undefined);
  const state: IkState = { main: main as MainTab, sub: sub as SubTab, page: parse(page) ?? 0 };
  if (Number.isNaN(state.page)) return null;
  for (const [key, value] of [["postId", parse(postId)], ["cpage", parse(cpage)], ["last", parse(last)]] as const) {
    if (value === undefined) continue;
    if (Number.isNaN(value)) return null;
    state[key] = value;
  }
  if (expanded === "1") state.expanded = true;
  return { action, state };
}
