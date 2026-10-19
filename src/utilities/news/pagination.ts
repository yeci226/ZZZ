import { splitMessages, type NewsMessagePart } from "./messages.js";
import { splitMarkdown } from "./presentation.js";
import type { DisplayBlock } from "./media.js";

export const PAGED_LAYOUT_VERSION = "paged-v1";
const heading = (b: DisplayBlock) =>
  b.type === "markdown" && /^#{1,6}\s+[^\n]+$/.test(b.text.trim());

/** Only break paragraphs outside fenced/inline formatting. Never split a link. */
function paragraphs(text: string): DisplayBlock[] {
  const result: DisplayBlock[] = [];
  let pending = "",
    fence = false;
  const inline: string[] = [];
  const emit = () => {
    if (pending.trim()) result.push({ type: "markdown", text: pending.trim() });
    pending = "";
  };
  for (const line of text.split("\n")) {
    const isHeading = !fence && !inline.length && /^#{1,6}\s+/.test(line);
    if (isHeading) emit();
    if (/^\s*```/.test(line)) fence = !fence;
    else if (!fence)
      for (const token of line.matchAll(/(?<!\\)(\*\*|~~|\*|`)/g)) {
        if (
          token[0] === "*" &&
          /^\s*$/.test(line.slice(0, token.index)) &&
          /\s/.test(line[token.index! + 1] ?? "")
        )
          continue;
        const at = inline.lastIndexOf(token[0]);
        if (at < 0) inline.push(token[0]);
        else inline.splice(at, 1);
      }
    pending += line + "\n";
    if ((!line.trim() || isHeading) && !fence && !inline.length) emit();
  }
  emit();
  return result;
}

/** Original run IDs survive pagination; crop atoms always retain single-gallery intent. */
function units(blocks: DisplayBlock[]): DisplayBlock[][] {
  const result: DisplayBlock[][] = [];
  for (const block of blocks.flatMap((b) =>
    b.type === "markdown" ? paragraphs(b.text) : [b],
  )) {
    const last = result.at(-1),
      tail = last?.at(-1);
    if (tail && heading(tail)) last!.push(block);
    else if (block.type === "gallery" && tail?.type === "markdown")
      last!.push(block);
    else if (
      block.type === "gallery" &&
      tail?.type === "gallery" &&
      block.runId &&
      block.runId === tail.runId
    )
      last!.push(block);
    else result.push([block]);
  }
  return result;
}
const fits = (blocks: DisplayBlock[]) => splitMessages(blocks).length === 1;

/** Minimize pages first, then the squared image counts to avoid one-image tails. */
function balanceImages(
  unit: DisplayBlock[],
  previous: DisplayBlock[] = [],
): NewsMessagePart[] | null {
  const first = unit.findIndex((b) => b.type === "gallery");
  if (first < 0 || unit.slice(first).some((b) => b.type !== "gallery"))
    return null;
  const prefix = [...previous, ...unit.slice(0, first)];
  const previousImages = previous.reduce(
    (n, b) => n + (b.type === "gallery" ? b.media.length : 0),
    0,
  );
  const atoms = unit
    .slice(first)
    .flatMap((b) =>
      b.type === "gallery" ? b.media.map((m) => ({ ...b, media: [m] })) : [],
    );
  type Choice = { pages: number; cost: number; end: number };
  const choices: Choice[] = Array(atoms.length + 1);
  choices[atoms.length] = { pages: 0, cost: 0, end: atoms.length };
  for (let start = atoms.length - 1; start >= 0; start--) {
    let best: Choice | undefined;
    for (
      let end = start + 1;
      end <= Math.min(atoms.length, start + 10);
      end++
    ) {
      const candidate = [
        ...(start === 0 ? prefix : []),
        ...atoms.slice(start, end),
      ];
      if (!fits(candidate)) break;
      const next = choices[end];
      if (!next) continue;
      const choice = {
        pages: next.pages + 1,
        cost:
          next.cost + (end - start + (start === 0 ? previousImages : 0)) ** 2,
        end,
      };
      if (
        !best ||
        choice.pages < best.pages ||
        (choice.pages === best.pages && choice.cost <= best.cost)
      )
        best = choice;
    }
    if (best) choices[start] = best;
  }
  if (!choices[0]) return null;
  const result: NewsMessagePart[] = [];
  for (let start = 0; start < atoms.length;) {
    const end = choices[start]!.end;
    result.push(
      splitMessages([
        ...(start === 0 ? prefix : []),
        ...atoms.slice(start, end),
      ])[0]!,
    );
    start = end;
  }
  return result;
}

export function paginateArticle(blocks: DisplayBlock[]): NewsMessagePart[] {
  const pages: NewsMessagePart[] = [];
  let current: DisplayBlock[] = [];
  const flush = () => {
    if (current.length) pages.push(...splitMessages(current));
    current = [];
  };
  for (const unit of units(blocks)) {
    if (fits(unit)) {
      if (!fits([...current, ...unit])) flush();
      current.push(...unit);
    } else {
      const joined = current.length ? balanceImages(unit, current) : null;
      if (joined) {
        pages.push(...joined);
        current = [];
        continue;
      }
      flush();
      const balanced = balanceImages(unit);
      if (balanced) pages.push(...balanced);
      else {
        // Keep a leading heading with the beginning of oversized prose.
        const normalized = [...unit];
        if (
          normalized[0] &&
          heading(normalized[0]) &&
          (normalized[0] as { text: string }).text.length < 1200 &&
          normalized[1]?.type === "markdown"
        ) {
          const title = (
            normalized.shift() as Extract<DisplayBlock, { type: "markdown" }>
          ).text;
          const body = (
            normalized.shift() as Extract<DisplayBlock, { type: "markdown" }>
          ).text;
          const chunks = splitMarkdown(body, 2400 - title.length - 2);
          normalized.unshift(
            ...chunks.map((text, i) => ({
              type: "markdown" as const,
              text: i === 0 ? `${title}\n\n${text}` : text,
            })),
          );
        }
        pages.push(...splitMessages(normalized));
      }
    }
  }
  flush();
  return pages.length ? pages : [{ blocks: [] }];
}
