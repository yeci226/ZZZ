/** Isolated test bot: only simulation interactions, no account jobs or production startup. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Client, Events, GatewayIntentBits, MessageFlags, PermissionFlagsBits, Routes } from "discord.js";
import command from "../commands/slash/zzz/gachaSimulate.js";
import settingsCommand from "../commands/slash/zzz/gachaSimulationSettings.js";
import detailsCommand from "../commands/slash/zzz/gachaSimulationDetails.js";
import { handleGachaSimulationPanel } from "../utilities/zzz/gachaSimulationPanelInteraction.js";
const commands = [command, settingsCommand, detailsCommand];
import { getConfig } from "../utilities/core/config.js";
import { assertSimulationAssets, getSimulationCatalog, selectSimulationBanner, simulationBannerChoices } from "../utilities/zzz/gachaSimulationCatalog.js";
import { handleGachaSimulationButton } from "../utilities/zzz/gachaSimulationInteraction.js";
import { startSimulationRecovery } from "../utilities/zzz/gachaSimulationRecovery.js";
import { getGachaSimulationStore } from "../utilities/zzz/gachaSimulationStore.js";

const args = process.argv.slice(2);
const option = (name: string) => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;

async function main() {
  const config = getConfig();
  if (!config.TEST_TOKEN || config.TEST_TOKEN === config.TOKEN) throw new Error("A distinct TEST_TOKEN is required");
  const channelId = option("--channel") || process.env.ZZZ_GACHA_TEST_CHANNEL;
  if (!channelId || !/^\d{17,20}$/.test(channelId)) throw new Error("Specify the authorized test channel with --channel CHANNEL_ID");
  const directory = path.resolve("previews/gacha-render-test/discord");
  // Test pulls must never consume production simulator state.
  process.env.ZZZ_GACHA_SIMULATION_DB = path.join(directory, "test.sqlite");
  const catalog = getSimulationCatalog();
  assertSimulationAssets(selectSimulationBanner(catalog), catalog);
  const client = new Client({ intents: [GatewayIntentBits.Guilds], rest: { timeout: 30_000, retries: 2 } });
  let stopRecovery: (() => void) | undefined;
  const stop = async () => { stopRecovery?.(); await client.destroy(); };
  process.once("SIGINT", () => { void stop().then(() => process.exit(0)); });
  process.once("SIGTERM", () => { void stop().then(() => process.exit(0)); });
  try {
    const ready = new Promise<void>(resolve => client.once(Events.ClientReady, () => resolve()));
    await client.login(config.TEST_TOKEN);
    await ready;
    console.log(JSON.stringify({ connected: true, bot: client.user!.username, botId: client.user!.id }));
    const channel = await client.channels.fetch(channelId);
    if (!channel?.isTextBased() || !channel.isSendable() || !('guild' in channel)) throw new Error("The destination must be an accessible guild text channel");
    const member = await channel.guild.members.fetchMe();
    const permissions = channel.permissionsFor(member);
    const required = {
      ViewChannel: PermissionFlagsBits.ViewChannel,
      SendMessages: channel.isThread() ? PermissionFlagsBits.SendMessagesInThreads : PermissionFlagsBits.SendMessages,
      EmbedLinks: PermissionFlagsBits.EmbedLinks,
      AttachFiles: PermissionFlagsBits.AttachFiles,
      ReadMessageHistory: PermissionFlagsBits.ReadMessageHistory,
    };
    const missing = Object.entries(required).filter(([, bit]) => !permissions?.has(bit)).map(([name]) => name);
    if (missing.length) throw new Error(`The test bot lacks channel permissions: ${missing.join(', ')}`);
    console.log(JSON.stringify({ preflight: true, bot: client.user!.username, botId: client.user!.id, guildId: channel.guildId, channelId }));
    if (!args.includes("--start")) { await stop(); return; }

    client.on(Events.InteractionCreate, async interaction => {
      const relevant = (interaction.isChatInputCommand() || interaction.isAutocomplete())
        ? commands.some(c => c.data.name === interaction.commandName)
        : (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()) && interaction.customId.startsWith("gsim:");
      if (!relevant) return;
      try {
        if (interaction.channelId !== channelId) {
          if (interaction.isAutocomplete()) await interaction.respond([]);
          else if (interaction.isRepliable()) await interaction.reply({ content: "測試版目前只開放指定的 test 頻道。", flags: MessageFlags.Ephemeral });
          return;
        }
        if (interaction.isAutocomplete()) await interaction.respond(simulationBannerChoices(String(interaction.options.getFocused())));
        else if (interaction.isChatInputCommand()) await commands.find(c => c.data.name === interaction.commandName)!.execute(client, interaction);
        else if (interaction.isButton() && /^gsim:(skip|one|ten):/.test(interaction.customId)) await handleGachaSimulationButton(interaction);
        else if (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()) await handleGachaSimulationPanel(interaction);
        console.log(JSON.stringify({ event: "interaction", kind: interaction.type, id: interaction.id,
          action: interaction.isButton() ? interaction.customId.split(':')[1] : "command", channelId }));
      } catch (error) {
        // Never log interaction tokens or a Discord request's complete payload.
        console.error(JSON.stringify({ event: "interaction_error", message: error instanceof Error ? error.message : "Request failed" }));
        if (interaction.isAutocomplete()) await interaction.respond([]).catch(() => {});
        else if (interaction.isRepliable()) {
          const payload = { content: "調頻暫時無法完成，結果與已保存的保底不會重抽。", flags: MessageFlags.Ephemeral as const };
          if (interaction.replied || interaction.deferred) await interaction.followUp(payload).catch(() => {});
          else await interaction.reply(payload).catch(() => {});
        }
      }
    });
    // POST upserts this command only; never bulk-replaces unrelated guild/global commands.
    const registered = await client.rest.post(Routes.applicationGuildCommands(client.user!.id, channel.guildId), {
      body: command.data.toJSON(),
    }) as { id: string };
    for (const extra of [settingsCommand, detailsCommand]) await client.rest.post(Routes.applicationGuildCommands(client.user!.id, channel.guildId), { body: extra.data.toJSON() });
    stopRecovery = startSimulationRecovery(client, getGachaSimulationStore());
    await mkdir(directory, { recursive: true });
    const reportFile = path.join(directory, "server.json");
    let previous: { botId?: string; channelId?: string; announcedMessageId?: string } = {};
    try { previous = JSON.parse(await readFile(reportFile, "utf8")); } catch { /* First run. */ }
    const report = { ready: true, bot: client.user!.username, botId: client.user!.id, guildId: channel.guildId,
      channelId, commandId: registered.id, startedAt: new Date().toISOString(), database: process.env.ZZZ_GACHA_SIMULATION_DB,
      announcedMessageId: previous.botId === client.user!.id && previous.channelId === channelId ? previous.announcedMessageId : undefined };
    await writeFile(reportFile, JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify(report));
    if (args.includes("--announce") && !report.announcedMessageId) {
      const message = await channel.send({ content: `模擬調頻測試已開啟：請使用 </模擬調頻:${registered.id}>。\n可測試單抽／十抽、跳過動畫，以及結果下方的接續抽取；測試版保底與正式版分開保存。`, allowedMentions: { parse: [] } });
      report.announcedMessageId = message.id;
      await writeFile(reportFile, JSON.stringify(report, null, 2) + "\n");
      console.log(JSON.stringify({ event: "announced", messageId: message.id, url: message.url }));
    }
  } catch (error) { await stop(); throw error; }
}

main().catch(error => {
  console.error(JSON.stringify({ error: error instanceof Error ? error.message : "Test server failed" }));
  process.exit(1);
});
