import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SlashCommandBuilder } from "discord.js";
import { syncGuildCommandOverrides } from "../src/utilities/core/guildCommandOverrides.js";
test("guild copies track the loaded command and apply only to the configured application and guild", async () => {
  const dir=mkdtempSync(join(tmpdir(), "guild-command-")),file=join(dir,"targets.json");
  const create=jest.fn().mockResolvedValue(undefined), app={id:"1170366976162537543",commands:{create}};
  const command=new SlashCommandBuilder().setName("leaderboard").setDescription("Updated ranking command")
    .setNameLocalizations({"zh-TW":"排行榜"}).setContexts(0,1,2).setIntegrationTypes(0,1)
    .addStringOption(option=>option.setName("agent").setDescription("Agent").setRequired(true).setAutocomplete(true));
  try {
    await syncGuildCommandOverrides(app,[command],file);expect(create).not.toHaveBeenCalled();
    writeFileSync(file,JSON.stringify({schemaVersion:1,registrations:[{applicationId:app.id,guildId:"938012107167920138",commands:["leaderboard"]}]}));
    await syncGuildCommandOverrides({...app,id:"111111111111111111"},[command],file);expect(create).not.toHaveBeenCalled();
    await syncGuildCommandOverrides(app,[command],file);
    const payload=create.mock.calls[0][0];
    expect(create).toHaveBeenCalledWith(expect.objectContaining({name:"leaderboard",name_localizations:{"zh-TW":"排行榜"},options:command.toJSON().options}),"938012107167920138");
    expect(payload).not.toHaveProperty("contexts");
    expect(payload).not.toHaveProperty("integration_types");
    expect(command.toJSON().contexts).toEqual([0,1,2]);
    await expect(syncGuildCommandOverrides(app,[],file)).rejects.toThrow("Guild command is not loaded");
    expect(create).toHaveBeenCalledTimes(1);
  } finally {rmSync(dir,{recursive:true,force:true});}
});
