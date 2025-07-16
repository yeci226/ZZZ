import { ChatInputCommandInteraction, MessageFlags, EmbedBuilder } from 'discord.js';
import { database } from '@/index';

import { discordToHoyolabLang, failedReply, getRandomColor, getUserLang, getUserZZZData, setupDefaultLang } from '@/utilities';
import { createTranslator } from '@/utilities/core/i18n';

export async function handleDailyCheckInCommand(interaction: ChatInputCommandInteraction) {
  const interactionUser = interaction.user;
  const interactionLocale = interaction.locale;
  const interactionOptions = interaction.options;
  const interactionChannel = interaction.channel;

  const userLocale = (await getUserLang(interactionUser.id)) || (await setupDefaultLang(interactionUser.id, discordToHoyolabLang(interactionLocale)));
  const tr = createTranslator(userLocale);

  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const selectedUser = interactionOptions.getUser('user') ?? interactionUser;
    const selectedAutoSign = interactionOptions.getString('autosign');
    const selectedTime = interactionOptions.getString('time');
    const selectedTag = interactionOptions.getString('tag');
    const channelId = interactionChannel?.id;
    const userAccounts = (await database.get(`${selectedUser.id}.account`)) || [];
    const zzz = await getUserZZZData(interaction, userLocale, selectedUser.id);

    if (userAccounts.length === 0) {
      return failedReply(interaction, tr('daily_NonAccount'), tr('daily_NonAccountDesc'));
    }
    if (!zzz) {
      return failedReply(interaction, tr('daily_Failed'));
    }

    if (selectedAutoSign === 'off') {
      await database.delete(`autoDaily.${interactionUser.id}`);

      return interaction.editReply({
        embeds: [new EmbedBuilder().setTitle(tr('autoDaily_Off')).setColor('#E76161')],
      });
    } else if (selectedTime || selectedTag || selectedAutoSign === 'on') {
      await database.set(`autoDaily.${interactionUser.id}`, { channelId, time: selectedTime, tag: selectedTag });

      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor('#A2CDB0')
            .setTitle(tr('autoDaily_On'))
            .setDescription(
              `${tr('autoDaily_Time', { time: selectedTime ? '`' + selectedTime + ':00`' : '`12:00`' })}\n${tr('autoDaily_Tag', { z: selectedTag === 'true' ? '`' + tr('True') + '`' : '`' + tr('False') + '`' })}`,
            ),
        ],
      });
    }

    const info = await zzz.daily.info();
    const reward = await zzz.daily.reward();
    const rewards = await zzz.daily.rewards();
    const res = await zzz.daily.claim();
    const todaySign = rewards.awards[info.total_sign_day - 1] || rewards.awards[0];
    const tmrSign = rewards.awards[info.total_sign_day];

    if (res.code === -5003 || res.info.is_sign) {
      return failedReply(interaction, tr('daily_Failed'), tr('daily_Signed'));
    }

    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(getRandomColor())
          .setTitle(tr('daily_SignSuccess'))
          .setThumbnail(todaySign?.icon)
          .setDescription(
            `${tr('daily_Description', { a: `\`${todaySign?.name}x${todaySign?.cnt}\`` })}${info.month_last_day ? '' : `\n\n${tr('daily_DescriptionTmr', { b: `\`${tmrSign?.name}x${tmrSign?.cnt}\`` })}`}`,
          )
          .addFields(
            { name: `${reward.month} ${tr('daily_Month')}`, value: '\u200b', inline: true },
            { name: tr('daily_SignedDay', { z: '`' + info.total_sign_day + '`' }), value: '\u200b', inline: true },
            { name: tr('daily_MissedDay', { z: '`' + info.sign_cnt_missed + '`' }), value: '\u200b', inline: true },
          ),
      ],
    });
  } catch (error: any) {
    return failedReply(interaction, tr('daily_Failed'), tr('daily_FailedDesc'), error.message);
  }
}
