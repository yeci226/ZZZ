/** Sends clearly labelled fixtures to an explicitly selected test channel. */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { Client, MessageFlags, Routes, type MessageEditOptions } from "discord.js";
import { getConfig } from "../utilities/core/config.js";
import { getSimulationCatalog, selectSimulationBanner, assertSimulationAssets } from "../utilities/zzz/gachaSimulationCatalog.js";
import { GachaSimulationStore } from "../utilities/zzz/gachaSimulationStore.js";
import { playSimulation, skipSimulation, type SimulationMessageHandle, type SimulationPayload } from "../utilities/zzz/gachaSimulationPlayback.js";

const args = process.argv.slice(2);
const option = (name: string) => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const channelId = option("--channel");
const runId = option("--run-id");
const sampleOption = option("--sample");
const bannerOption = option("--banner");
const production = args.includes("--production");
if (!channelId || !/^\d{17,20}$/.test(channelId)) throw new Error("Specify --channel with the authorized test channel ID");
if (runId && !/^[a-z0-9-]{1,40}$/.test(runId)) throw new Error("Use a short alphanumeric --run-id");
if (sampleOption && !['single', 'ten', 'ten-ab'].includes(sampleOption)) throw new Error("Use --sample single, ten, or ten-ab");
if (!args.includes("--send")) {
  const samples = sampleOption === 'ten-ab' ? ["1A/9B ten-pull, automatic replacement"]
    : [
      ...(!sampleOption || sampleOption === 'single' ? ["S single, skip after 3 seconds"] : []),
      ...(!sampleOption || sampleOption === 'ten' ? ["1S/2A/7B ten-pull, automatic replacement"] : []),
    ];
  console.log(JSON.stringify({ dryRun: true, channelId, samples, tokenSource: production ? "TOKEN" : "TEST_TOKEN",
    next: "Add --send to post these labelled fixtures" }));
} else await run().catch(error => {
  console.error(JSON.stringify({ error: error instanceof Error ? error.message : "Discord smoke test failed" }));
  process.exitCode = 1;
});

function labelFixture<T extends MessageEditOptions>(payload: T): T {
  const copy = structuredClone(payload.components) as any[];
  for (const box of copy) {
    for (const row of box.components || []) {
      for (const button of row.components || []) if (button.type === 2) button.disabled = true;
    }
    box.components.unshift({ type: 10, content: "-# 固定樣片驗證（按鈕停用）。互動測試請使用 /模擬調頻。" });
  }
  return { ...payload, components: copy };
}

async function run() {
  const config = getConfig();
  const token = production ? config.TOKEN : config.TEST_TOKEN;
  if (!token || (!production && config.TEST_TOKEN === config.TOKEN)) throw new Error("A distinct TEST_TOKEN is required, or explicitly select --production");
  const client = new Client({ intents: [], rest: { timeout: 60_000, retries: 2 } });
  client.rest.setToken(token);
  const me = await client.rest.get(Routes.user("@me")) as { id: string; bot: boolean; username: string };
  if (!me.bot) throw new Error("The token must belong to a bot");
  const destination = await client.rest.get(Routes.channel(channelId!)) as { guild_id?: string };
  if (!destination.guild_id) throw new Error("The test destination must be a guild channel");
  // A REST-only Client has no gateway-populated guild cache. Populate this guild
  // before constructing a GuildTextChannel; no second gateway session is needed.
  await client.guilds.fetch(destination.guild_id);
  const channel = await client.channels.fetch(channelId!);
  if (!channel?.isSendable() || !('guildId' in channel)) throw new Error("The test destination must be an accessible guild text channel");
  const directory = path.resolve("previews/gacha-render-test/discord");
  await mkdir(directory, { recursive: true });
  const store = new GachaSimulationStore(path.join(directory, "smoke.sqlite"));
  const catalog = getSimulationCatalog(), banner = selectSimulationBanner(catalog, bannerOption);
  assertSimulationAssets(banner, catalog);
  const receipts: Array<Record<string, unknown>> = [];
  try {
    const samples = sampleOption === 'ten-ab' ? [
      { name: "ten-s00-a01-b09", count: 10 as const, ranks: "ABBBBBBBBB",
        values: [.05, 0, 0, ...Array.from({ length: 9 }, (_, i) => [.8, i / 9]).flat()], skip: false },
    ] : [
      { name: "single-s", count: 1 as const, ranks: "S", values: [0, 0], skip: true },
      { name: "ten-s01-a02-b07", count: 10 as const, ranks: "SAABBBBBBB",
        values: [0, 0, .05, 0, 0, .05, 0, .99, ...Array.from({ length: 7 }, (_, i) => [.8, i / 7]).flat()], skip: false },
    ];
    for (const sample of samples) {
      if (sampleOption && sampleOption !== 'ten-ab' && (sample.count === 1 ? 'single' : 'ten') !== sampleOption) continue;
      let index = 0;
      // Separate owners/DB keep fixed fixtures out of every user's test pity.
      const key = `smoke-r1${runId ? ':' + runId : ''}:${me.id}:${channelId}:${sample.name}${bannerOption ? ':' + banner.id : ''}`;
      const session = store.draw(key, key, banner, sample.count, () => sample.values[index++] ?? .9);
      if (session.pulls.map(p => p.rank).join("") !== sample.ranks) throw new Error("Fixture ranks differ from the expected animation");
      const startedAt = Date.now();
      let mediaReadyMs: number | undefined, resultEditMs: number | undefined;
      const wrap = (id: string): SimulationMessageHandle => ({ id,
        edit: p => { resultEditMs = Date.now() - startedAt; return channel.messages.edit(id, labelFixture(p)); },
        fetch: async () => {
          const raw = await client.rest.get(Routes.channelMessage(channelId!, id)) as any;
          const media = raw.components?.flatMap((b: any) => b.components || []).find((c: any) => c.type === 12)?.items?.[0]?.media;
          if (media?.loading_state === 2 && mediaReadyMs === undefined) mediaReadyMs = Date.now() - startedAt;
          return raw;
        },
      });
      const seen: { animation?: boolean; uploadMs?: number; gifBytes?: number; source?: string; media?: Record<string, unknown> } = {};
      if (!session.messageId) {
        await playSimulation(session, catalog, store, {
          attachmentLimit: 10_000_000, applicationId: me.id, channelId: channelId!, guildId: channel.guildId,
          send: async (payload: SimulationPayload) => {
            const message = await channel.send(labelFixture(payload));
            seen.animation = [...message.attachments.values()].some(a => a.name === "gacha-animation.gif")
              || JSON.stringify(message.components).includes(".gif");
            seen.uploadMs = Date.now() - startedAt;
            seen.gifBytes = payload.files?.find(file => file.name === 'gacha-animation.gif')?.attachment.length;
            seen.source = seen.gifBytes ? 'attachment' : 'cdn';
            return wrap(message.id);
          },
        });
        if (!seen.animation) throw new Error("Discord did not receive an animation; inspect the saved static fallback");
      }
      const saved = store.get(session.id)!;
      if (!saved.messageId) throw new Error("The fixture was not delivered");
      if (!saved.finished && !session.messageId) {
        await pause(1000);
        const raw = await client.rest.get(Routes.channelMessage(channelId!, saved.messageId)) as any;
        const media = raw.components?.flatMap((b: any) => b.components || []).find((c: any) => c.type === 12)?.items?.[0]?.media;
        if (media) seen.media = { width: media.width, height: media.height, contentType: media.content_type,
          loadingState: media.loading_state, hostname: new URL(media.url).hostname, proxyUrl: media.proxy_url };
      }
      if (!saved.finished && (sample.skip || session.messageId)) {
        if (!session.messageId) await pause(3000);
        await skipSimulation(saved, catalog, store, wrap(saved.messageId), 10_000_000);
      }
      const deadline = Date.now() + 45_000;
      while (!store.get(session.id)!.finished && Date.now() < deadline) await pause(250);
      if (!store.get(session.id)!.finished) throw new Error("Timed out waiting for the result replacement");
      const result = await channel.messages.fetch({ message: saved.messageId, force: true });
      // Components V2 consumes attachment:// files into gallery media. Discord
      // may return an empty top-level attachments array after a successful edit.
      const boxes = result.components.map(c => c.toJSON()) as any[];
      const media = boxes.flatMap(b => b.components || []).filter(c => c.type === 12).flatMap(c => c.items || []).map(i => i.media);
      if (!result.flags.has(MessageFlags.IsComponentsV2) || media.length !== 1 || !new URL(media[0].url).pathname.endsWith('/gacha-result.png')) {
        throw new Error("The result did not replace the GIF with one Components V2 PNG");
      }
      const image = await fetch(media[0].url, { signal: AbortSignal.timeout(20_000) });
      if (!image.ok || !/image\/png/i.test(image.headers.get('content-type') || '')) throw new Error("The result image is not accessible");
      const png = Buffer.from(await image.arrayBuffer());
      if (!png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || png.readUInt32BE(16) !== 1280 || png.readUInt32BE(20) !== 720) {
        throw new Error("The result image has an unexpected format or dimensions");
      }
      receipts.push({ sample: sample.name, botId: me.id, channelId, messageId: result.id, url: result.url,
        bannerId: banner.id, title: boxes.flatMap(b => b.components || []).find(c => c.type === 10 && c.content.startsWith('###'))?.content,
        mode: sample.skip ? "programmatic-skip" : "automatic", resumed: !!session.messageId,
        ...seen, mediaReadyMs, resultEditMs, playbackWaitMs: mediaReadyMs !== undefined && resultEditMs !== undefined ? resultEditMs - mediaReadyMs : undefined,
        resultBytes: png.length, elapsedMs: Date.now() - startedAt, ranks: sample.ranks, finished: true });
      await writeFile(path.join(directory, runId ? `smoke-${runId}-receipts.json` : "smoke-receipts.json"), JSON.stringify(receipts, null, 2) + "\n");
      console.log(JSON.stringify(receipts.at(-1)));
    }
  } finally { store.close(); await client.destroy(); }
}
