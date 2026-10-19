import { Client, MessagePayload, REST } from "discord.js";
import {
  installMessageSubtext,
  messageSubtext,
} from "../src/utilities/core/messageSubtext";

test("plain message content becomes subtext without changing cards or delivery options", async () => {
  expect(messageSubtext("第一行\n\n第二行\r\n-# 已經是小字")).toBe(
    "-# 第一行\n\n-# 第二行\r\n-# 已經是小字",
  );
  expect(messageSubtext("\n \n")).toBe("\n \n");
  expect(messageSubtext('前文\n```json\n{"ok": true}\n```\n後文')).toBe(
    '-# 前文\n```json\n{"ok": true}\n```\n-# 後文',
  );
  expect(messageSubtext("```unfinished\ncode")).toBe("```unfinished\ncode");
  expect(messageSubtext("x".repeat(1997))).toHaveLength(2000);
  expect(messageSubtext("x".repeat(2000))).toBe("x".repeat(2000));

  const rest = new REST();
  const request = jest.fn(async (_options: Parameters<REST["request"]>[0]) => ({
    ok: true,
  }));
  rest.request = request;
  installMessageSubtext(rest);
  const body = {
    content: "<@123> 已完成\n第二行",
    embeds: [{ description: "卡片正文" }],
    components: [{ type: 10, content: "### 卡片標題" }],
    allowed_mentions: { parse: [], users: ["123"] },
    flags: 64,
    nonce: "same-nonce",
    enforce_nonce: true,
  };
  const files = [{ data: Buffer.from("image"), name: "card.png" }];
  const query = new URLSearchParams({ wait: "true" });
  for (const route of [
    "/channels/123/messages",
    "/channels/123/messages/456",
    "/webhooks/123/token",
    "/webhooks/123/token/messages/@original",
    "/webhooks/123/token/messages/456",
  ] as const) {
    for (const method of ["post", "patch"] as const) {
      await expect(
        rest[method](route, { body, files, query, auth: false }),
      ).resolves.toEqual({ ok: true });
      const sent = request.mock.calls.at(-1)![0];
      expect(sent).toMatchObject({
        fullRoute: route,
        method: method.toUpperCase(),
        auth: false,
      });
      expect(sent.body).toEqual({
        ...body,
        content: "-# <@123> 已完成\n-# 第二行",
      });
      expect(sent.files).toBe(files);
      expect(sent.query).toBe(query);
    }
  }
  expect(body.content).toBe("<@123> 已完成\n第二行");
  for (const type of [4, 7]) {
    await rest.post("/interactions/123/token/callback", {
      body: { type, data: body },
      files,
    });
    expect(request.mock.calls.at(-1)![0].body).toEqual({
      type,
      data: { ...body, content: "-# <@123> 已完成\n-# 第二行" },
    });
  }
  for (const content of [undefined, null, ""]) {
    const empty = { content, components: body.components, flags: 32768 };
    await rest.patch("/webhooks/123/token/messages/@original", { body: empty });
    expect(request.mock.calls.at(-1)![0].body).toBe(empty);
  }
  for (const type of [5, 6, 8, 9]) {
    const callback = { type, data: body };
    await rest.post("/interactions/123/token/callback", { body: callback });
    expect(request.mock.calls.at(-1)![0].body).toBe(callback);
  }
  await rest.patch("/guilds/123/members/@me", { body });
  expect(request.mock.calls.at(-1)![0].body).toBe(body);
  await rest.get("/channels/123/messages", { body });
  expect(request.mock.calls.at(-1)![0].body).toBe(body);
  await rest.post("/channels/123/messages", { body, passThroughBody: true });
  expect(request.mock.calls.at(-1)![0].body).toBe(body);

  // Exercise discord.js serialization too, without logging in or sending a message.
  const client = new Client({ intents: [] });
  const serialized = MessagePayload.create(
    { client } as any,
    "字串回覆",
  ).resolveBody().body;
  await rest.post("/interactions/123/token/callback", {
    body: { type: 4, data: serialized },
  });
  expect((request.mock.calls.at(-1)![0].body as any).data.content).toBe(
    "-# 字串回覆",
  );
  const failure = new Error("rate limit");
  request.mockRejectedValueOnce(failure);
  await expect(rest.post("/channels/123/messages", { body })).rejects.toBe(
    failure,
  );
});
