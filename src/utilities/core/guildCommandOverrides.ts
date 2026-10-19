import { existsSync, readFileSync } from "node:fs";
import type { RESTPostAPIApplicationCommandsJSONBody } from "discord.js";

interface ApplicationRegistry {
  id: string;
  commands: { create(command: RESTPostAPIApplicationCommandsJSONBody, guildId: string): Promise<unknown> };
}

interface LoadedCommand {
  name?: string;
  toJSON(): RESTPostAPIApplicationCommandsJSONBody;
}

/** Keep explicitly provisioned guild copies current without replacing the guild's other commands. */
export async function syncGuildCommandOverrides(
  application: ApplicationRegistry,
  commands: readonly LoadedCommand[],
  filename = "data/zzz-guild-command-overrides.json",
): Promise<void> {
  if (!existsSync(filename)) return;
  const config = JSON.parse(readFileSync(filename, "utf8"));
  if (config.schemaVersion !== 1 || !Array.isArray(config.registrations)) throw new Error("Invalid guild command configuration");
  for (const entry of config.registrations) {
    if (entry.applicationId !== application.id) continue;
    if (!/^\d{17,20}$/.test(entry.guildId) || !Array.isArray(entry.commands)) throw new Error("Invalid guild command target");
    for (const name of new Set<string>(entry.commands)) {
      const command = commands.find(command => command.name === name);
      if (!command) throw new Error("Guild command is not loaded");
      const payload = { ...command.toJSON() };
      // Installation types and DM contexts apply only to global commands.
      delete payload.integration_types;
      delete payload.contexts;
      delete payload.dm_permission;
      await application.commands.create(payload, entry.guildId);
    }
  }
}
