// Only the command `data` builders are exercised; stub every heavy dependency.
for (const path of [
  "core/commandTips", "utilities", "accountStore", "zzz/officialRecordApi", "zzz/noteRenderer",
  "zzz/profile", "zzz/team", "zzz/shiyu/index", "zzz/deadly", "zzz/recordCache", "zzz/mysteryMazeView",
  "zzz/gachaPrivacy", "zzz/signalLogView", "zzz/signalActionText", "zzz/gachaArchive",
  "zzz/rngMoeImportFlow", "zzz/manualGachaImportFlow",
]) jest.mock(`../src/utilities/${path}.js`, () => ({}));

import { MessageFlags, SlashCommandBuilder } from "discord.js";
import {
  buildPrivateOption,
  isPrivateRequested,
  privateReplyOptions,
} from "../src/utilities/shared/privateOption";
import note from "../src/commands/slash/zzz/note";
import profile from "../src/commands/slash/zzz/profile";
import signal from "../src/commands/slash/zzz/gacha";
import mysterymaze from "../src/commands/slash/zzz/mysterymaze";
import shiyu from "../src/commands/slash/zzz/shiyu";
import deadly from "../src/commands/slash/zzz/deadly";
import team from "../src/commands/slash/zzz/team";

const asked = (value: boolean | null) => ({ options: { getBoolean: () => value } });

describe("private option helper", () => {
  it("builds an optional, localised boolean option", () => {
    const json: any = new SlashCommandBuilder().setName("x").setDescription("x")
      .addBooleanOption(buildPrivateOption).toJSON().options![0];
    expect(json.name).toBe("private");
    expect(json.required).toBeFalsy();
    expect(json.name_localizations["zh-TW"]).toBe("僅自己可見");
  });

  it("is ephemeral only when explicitly true", () => {
    expect(privateReplyOptions(asked(true))).toEqual({ flags: MessageFlags.Ephemeral });
    expect(privateReplyOptions(asked(false))).toBeUndefined();
    expect(privateReplyOptions(asked(null))).toBeUndefined();
    expect(privateReplyOptions({})).toBeUndefined();
    expect(isPrivateRequested(asked(true))).toBe(true);
  });
});

const LOCALES = ["zh-TW", "zh-CN", "ja", "ko", "fr", "vi"];
const commands: Array<[string, any, string | null]> = [
  ["note check", note, "check"],
  ["profile", profile, null],
  ["signal log", signal, "log"],
  ["mysterymaze", mysterymaze, null],
  ["shiyudefense", shiyu, null],
  ["deadlyassault", deadly, null],
  ["team", team, null],
];

describe.each(commands)("%s command data", (_label, command, subcommand) => {
  const json: any = command.data.toJSON();
  const options: any[] = subcommand
    ? json.options.find((option: any) => option.name === subcommand).options
    : json.options;

  it("has a localised, optional private option after the required ones", () => {
    const index = options.findIndex((option) => option.name === "private");
    expect(index).toBeGreaterThanOrEqual(0);
    const option = options[index];
    expect(option.type).toBe(5);
    expect(option.required).toBeFalsy();
    for (const locale of LOCALES) {
      expect(option.name_localizations[locale]).toMatch(/^[^\s]{1,32}$/u);
      expect(option.description_localizations[locale]).toBeTruthy();
    }
    expect(option.name_localizations["zh-TW"]).toBe("僅自己可見");
    expect(options.slice(index + 1).some((other) => other.required)).toBe(false);
    expect(options.filter((other) => other.name === "private")).toHaveLength(1);
  });
});
