import schedule from 'node-schedule';
import { Events, ActivityType } from 'discord.js';
import { client, cluster } from '@/index.js';

import Logger from '@/utilities/core/logger';
import autoDailySign from '@/utilities/zzz/auto-daily';
import autoRedeem from '@/utilities/zzz/auto-redeem';
import autoDownloadIcons from '@/utilities/zzz/auto-download-icons';

async function updatePresence() {
  const results = await cluster.broadcastEval((c) => c.guilds.cache.size);
  const totalGuilds = results.reduce((prev, val) => prev + val, 0);

  client.user?.setPresence({
    activities: [{ name: `${totalGuilds} 個伺服器`, type: ActivityType.Watching }],
    status: 'online',
  });
}

client.on(Events.ClientReady, async () => {
  new Logger('系統').success(`${client.user?.tag} 已經上線！`);
  await autoDailySign();
  await autoRedeem();
  await autoDownloadIcons();

  schedule.scheduleJob('0 * * * *', async () => {
    if (cluster.id == 0) {
      await autoDailySign();
      await autoRedeem();
    }
  });

  schedule.scheduleJob('0 3 * * *', async () => {
    if (cluster.id == 0) {
      await autoDownloadIcons();
    }
  });

  setInterval(updatePresence, 10000);
});
