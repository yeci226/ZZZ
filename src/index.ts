import { loadConfig } from "./utilities/core/config.js";
loadConfig();

import "./utilities/index.js";
import { Client, GatewayIntentBits, Options, Partials } from "discord.js";
import { getInfo } from "discord-hybrid-sharding";
import { installMessageSubtext } from "./utilities/core/messageSubtext.js";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [
    Partials.Channel,
    Partials.Message,
    Partials.User,
    Partials.GuildMember,
    Partials.Reaction,
  ],
  allowedMentions: {
    parse: ["users"],
    repliedUser: false,
  },
  // Only guilds/channels/roles caches are read; drop the rest, keep the bot's own user/member.
  makeCache: Options.cacheWithLimits({
    ...Options.DefaultMakeCacheSettings,
    MessageManager: 0,
    ReactionManager: 0,
    GuildEmojiManager: 0,
    GuildStickerManager: 0,
    PresenceManager: 0,
    VoiceStateManager: 0,
    ThreadMemberManager: 0,
    UserManager: { maxSize: 0, keepOverLimit: (u) => u.id === u.client.user?.id },
    GuildMemberManager: { maxSize: 0, keepOverLimit: (m) => m.id === m.client.user?.id },
  }),
  shards: getInfo().SHARD_LIST,
  shardCount: getInfo().TOTAL_SHARDS,
});

installMessageSubtext(client.rest);

export { client };

import("./main.js");
