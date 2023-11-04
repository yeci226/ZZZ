const client = require("../index");
const { ActivityType, Events } = require("discord.js");
const log = require("../util/logger");
const logger = new log("Ready");

client.on(Events.ClientReady, async () => {
  const results = await client.cluster.broadcastEval(
    (c) => c.guilds.cache.size
  );
  const totalGuilds = results.reduce((prev, val) => prev + val, 0);

  logger.success(`${client.user.tag} 已經上線！`);
  client.user.setPresence({
    activities: [
      {
        name: `${totalGuilds} 個伺服器`,
        type: ActivityType.Playing,
      },
    ],
    status: "online",
  });
});
