/** Unwrap URL-labelled links, leaving code and descriptive links untouched. */
export function normalizeUrlLabels(input: string): string {
  const unwrap = (text: string) =>
    text.replace(
      /(?<!\\)\[(https?:\/\/[^\]\s]+)\]\((?:<(https?:\/\/[^>\s]+)>|(https?:\/\/[^\s()]+(?:\([^\s()]*\)[^\s()]*)*))\)/g,
      (
        whole,
        label: string,
        angled: string | undefined,
        bare: string | undefined,
      ) => {
        const destination = angled ?? bare!;
        try {
          return new URL(label).href === new URL(destination).href
            ? destination
            : whole;
        } catch {
          return whole;
        }
      },
    );
  const prose = (text: string) => {
    let out = "",
      cursor = 0;
    const ticks = /`+/g;
    let opening: RegExpExecArray | null;
    while ((opening = ticks.exec(text))) {
      if (text[opening.index - 1] === "\\") continue;
      const endPattern = new RegExp(
        `(?<!\x60)\x60{${opening[0].length}}(?!\x60)`,
        "g",
      );
      endPattern.lastIndex = ticks.lastIndex;
      const closing = endPattern.exec(text);
      if (!closing) continue;
      out += unwrap(text.slice(cursor, opening.index));
      cursor = closing.index + closing[0].length;
      out += text.slice(opening.index, cursor);
      ticks.lastIndex = cursor;
    }
    return out + unwrap(text.slice(cursor));
  };
  let fence: { marker: string; length: number } | null = null;
  let pending = "",
    result = "";
  // Fences and inline spans (including multiline spans) are never rewritten.
  for (const line of input.split(/(?<=\n)/)) {
    const match = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) {
      result += line;
      if (
        match &&
        match[1][0] === fence.marker &&
        match[1].length >= fence.length &&
        /^\s*$/.test(line.slice(match[0].length))
      )
        fence = null;
    } else if (match) {
      result += prose(pending) + line;
      pending = "";
      fence = { marker: match[1][0], length: match[1].length };
    } else pending += line;
  }
  return result + prose(pending);
}
