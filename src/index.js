require("dotenv").config();
const {
  Client,
  Options,
  GatewayIntentBits,
  Partials,
  Collection,
} = require("discord.js");
const { getInfo } = require("discord-hybrid-sharding");
const { ClusterClient } = require("discord-hybrid-sharding");

const client = new Client({
  makeCache: Options.cacheWithLimits({
    ...Options.DefaultMakeCacheSettings,
    BaseGuildEmojiManager: 0,
    GuildBanManager: 0,
    GuildInviteManager: 0,
    GuildStickerManager: 0,
    GuildScheduledEventManager: 0,
    MessageManager: 0,
    ReactionManager: 0,
    ReactionUserManager: 0,
    GuildMemberManager: {
      maxSize: 200,
      keepOverLimit: (member) => member.id === client.user.id,
    },
  }),
  sweepers: {
    ...Options.DefaultSweeperSettings,
    messages: {
      interval: 3600,
      lifetime: 1800,
    },
    users: {
      interval: 3600,
      filter: () => (user) => user.bot && user.id !== client.user.id,
    },
  },
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [
    Partials.Channel,
    Partials.Message,
    Partials.User,
    Partials.GuildMember,
    Partials.Reaction,
  ],
  shards: getInfo().SHARD_LIST,
  shardCount: getInfo().TOTAL_SHARDS,
});

module.exports = client;
// Global Variables
client.cluster = new ClusterClient(client);
client.commands = new Collection();
client.slashCommands = new Collection();
client.cluster.on("ready", async () => {
  require("./handler")(client);
  require("./util/index");
});

client.login(
  process.env.NODE_ENV === "dev" ? process.env.TESTOKEN : process.env.TOKEN
);
