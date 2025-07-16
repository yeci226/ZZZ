import { StringSelectMenuInteraction, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder } from 'discord.js';

import { discordToHoyolabLang, failedReply, getNewsList, getPostFull, getRandomColor, getUserLang, parsePostContent, setupDefaultLang } from '@/utilities';
import { createTranslator } from '@/utilities/core/i18n';

export async function handleNewsTypeSelect(interaction: StringSelectMenuInteraction) {
  const interactionUser = interaction.user;
  const interactionLocale = interaction.locale;
  const interactionValue = interaction.values[0];

  const userLocale = (await getUserLang(interactionUser.id)) || (await setupDefaultLang(interactionUser.id, discordToHoyolabLang(interactionLocale)));
  const tr = createTranslator(userLocale);

  try {
    await interaction.deferReply();

    const newsData = await getNewsList(userLocale, interactionValue);

    return interaction.editReply({
      components: [
        new ActionRowBuilder()
          .addComponents(
            new StringSelectMenuBuilder()
              .setPlaceholder(tr('news_SelectPost'))
              .setCustomId('news_post')
              .setMinValues(1)
              .setMaxValues(1)
              .addOptions(
                // TODO: 修改類型
                newsData.data.list.map((data: any) => {
                  const date = new Date(data.post.created_at * 1000);
                  return {
                    label: `${data.post.subject.length < 100 ? data.post.subject : data.post.subject.slice(0, 97).concat('...')}`,
                    description: date.getUTCFullYear() + tr('Year') + (date.getUTCMonth() + 1) + tr('Month') + date.getUTCDate() + tr('Day'),
                    value: `${data.post.post_id}`,
                  };
                }),
              ),
          )
          .toJSON(),
        new ActionRowBuilder()
          .addComponents(
            new StringSelectMenuBuilder()
              .setPlaceholder(tr('news_SelectType'))
              .setCustomId('news_type')
              .setMinValues(1)
              .setMaxValues(1)
              .addOptions({ label: tr('news_Notice'), emoji: '🔔', value: '1' }, { label: tr('news_Events'), emoji: '🔥', value: '2' }, { label: tr('news_Info'), emoji: '🗞️', value: '3' }),
          )
          .toJSON(),
      ],
    });
  } catch (error: any) {
    return failedReply(interaction, tr('news_SelectFailed'), tr('news_SelectFailedDesc'), error.message);
  }
}

export async function handleNewsPostSelect(interaction: StringSelectMenuInteraction) {
  const interactionUser = interaction.user;
  const interactionLocale = interaction.locale;
  const interactionValue = interaction.values[0];

  const userLocale = (await getUserLang(interactionUser.id)) || (await setupDefaultLang(interactionUser.id, discordToHoyolabLang(interactionLocale)));
  const tr = createTranslator(userLocale);

  try {
    await interaction.deferReply();

    const postData = await getPostFull(userLocale, interactionValue);
    const { post, user, image_list, cover_list } = postData.post;
    const content = await parsePostContent(post.content);
    const date = new Date(post.created_at * 1000);

    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(getRandomColor())
          .setAuthor({
            iconURL: user.avatar_url ?? '',
            name: user.nickname ?? '',
            url: `https://www.hoyolab.com/accountCenter?id=${user.uid}`,
          })
          .setTitle(post.subject ?? tr('None'))
          .setURL(`https://www.hoyolab.com/article/${post.post_id}`)
          .setDescription(content.length < 4096 ? content : (content.slice(0, 4096 - 3).concat('...') ?? tr('None')))
          .setFooter({
            text: date.getUTCFullYear() + tr('Year') + (date.getUTCMonth() + 1) + tr('Month') + date.getUTCDate() + tr('Day'),
          })
          .setImage(image_list[0]?.url ?? cover_list[0]?.url),
      ],
    });
  } catch (error: any) {
    return failedReply(interaction, tr('news_SelectFailed'), tr('news_SelectFailedDesc'), error.message);
  }
}
