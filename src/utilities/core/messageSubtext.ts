import type { REST } from "discord.js";

export function messageSubtext(content: string): string {
  let inCodeBlock = false;
  const formatted = content
    .split("\n")
    .map((line) => {
      const fences = line.match(/```/g)?.length ?? 0;
      const isCode = inCodeBlock || fences > 0;
      if (fences % 2) inCodeBlock = !inCodeBlock;
      return isCode || !line.trim() || /^-#(?:\s|$)/.test(line)
        ? line
        : `-# ${line}`;
    })
    .join("\n");

  // Keep near-limit messages intact; never truncate content or make a valid send fail.
  return formatted.length <= 2000 ? formatted : content;
}

/** Apply the bot's plain-message style at its REST boundary, leaving card contents alone. */
export function installMessageSubtext(rest: REST): void {
  const request = rest.request.bind(rest);
  rest.request = (options) => {
    const body = options.body;
    if (
      !["POST", "PATCH"].includes(options.method) ||
      options.passThroughBody ||
      !body ||
      typeof body !== "object"
    ) {
      return request(options);
    }

    const payload = body as Record<string, unknown>;
    const callback = /^\/interactions\/[^/]+\/[^/]+\/callback$/.test(
      options.fullRoute,
    );
    const messageRoute =
      /^\/channels\/\d+\/messages(?:\/\d+)?$/.test(options.fullRoute) ||
      /^\/webhooks\/\d+\/[^/]+(?:\/messages\/(?:\d+|@original))?$/.test(
        options.fullRoute,
      );
    const message = callback
      ? payload.type === 4 || payload.type === 7
        ? payload.data
        : undefined
      : messageRoute
        ? payload
        : undefined;
    if (!message || typeof message !== "object" || !("content" in message)) {
      return request(options);
    }
    if (typeof message.content !== "string" || !message.content) {
      return request(options);
    }

    const formatted = { ...message, content: messageSubtext(message.content) };
    return request({
      ...options,
      body: callback ? { ...payload, data: formatted } : formatted,
    });
  };
}
