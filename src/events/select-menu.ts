import Queue from 'queue';
import {
  Events,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
  StringSelectMenuInteraction,
  ButtonInteraction,
  ColorResolvable,
} from 'discord.js';
import { client, database } from '@/index.js';

import { getUserLang, getUserZZZData, drawInQueueReply, getUserHoyolabData, setupDefaultLang, discordToHoyolabLang } from '@/utilities';
import { createTranslator } from '@/utilities/core/i18n';
import { handleEditAccountSelect, handleEditAccountTypeSelect, handleDeleteAccountSelect, handleEditAccountCookieSelect } from '@/utilities/zzz/account';
import { handleNewsPostSelect, handleNewsTypeSelect } from '@/utilities/zzz/news';

import { drawMainImage, drawCharacterImage } from '@/renderers/profile';

import emoji from '@/assets/emoji';

const drawQueue = new Queue({ autostart: true });
const elementId: Record<number, string> = {
  200: 'physic',
  201: 'fire',
  202: 'ice',
  203: 'thunder',
  205: 'ether',
};

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;

  const interactionCustomId = interaction.customId;

  if (interactionCustomId == 'profile_CharacterMindScape') handleMindScapeChange(interaction);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isStringSelectMenu()) return;

  const interactionUser = interaction.user;
  const interactionLocale = interaction.locale;
  const interactionCustomId = interaction.customId;
  const interactionValues = interaction.values;

  const userLocale = (await getUserLang(interactionUser.id)) || (await setupDefaultLang(interactionUser.id, discordToHoyolabLang(interactionLocale)));

  if (!interactionCustomId.startsWith('account')) await interaction.update({ fetchReply: true }).catch(() => {});
  if (interactionCustomId.startsWith('news')) handleNewsAction(interaction);
  if (interactionCustomId.startsWith('account')) handleAccountAction(interaction);
  if (interactionCustomId.startsWith('profile_SelectCharacter')) handleSelectCharacter(interaction);
});

async function handleMindScapeChange(interaction: ButtonInteraction) {
  const [row1, row2] = interaction.message.components;

  const mindScapeKey = `${interaction.user.id}.mindscape`;
  const mindScape = (await database.get(mindScapeKey)) ?? true;

  await database.set(mindScapeKey, !mindScape);

  await interaction.message.edit({
    components: [row1, row2],
  });
}

async function handleSelectCharacter(interaction: StringSelectMenuInteraction) {
  const interactionUser = interaction.user;
  const interactionLocale = interaction.locale;
  const interactionCustomId = interaction.customId;
  const interactionValues = interaction.values;

  const userLocale = (await getUserLang(interactionUser.id)) || (await setupDefaultLang(interactionUser.id, discordToHoyolabLang(interactionLocale)));
  const tr = createTranslator(userLocale);

  const drawTask = async () => {
    try {
      await interaction.editReply({
        embeds: [new EmbedBuilder().setTitle(tr('Searching')).setImage('https://static.wikia.nocookie.net/zenless-zone-zero/images/b/bb/Bangboo_Net_Loading.gif')],
        components: [],
      });

      const requestStartTime = Date.now();
      const [userId, accountIndex, characterId] = interactionValues[0].split('-');
      const zzz = await getUserZZZData(userLocale, userId, parseInt(accountIndex));
      if (!zzz) return;

      const characters = await zzz.record.characters();
      const requestEndTime = Date.now();
      const drawStartTime = Date.now();
      const selectedCharacter = characterId !== 'main' ? ((await zzz.record.character(parseInt(characterId))) as any)[0] : null;
      let imageBuffer;

      if (characterId == 'main') {
        const record = await zzz.record.records();
        const userData = await getUserHoyolabData(interaction, userLocale, userId);
        imageBuffer = (await drawMainImage()) as any;
      } else {
        imageBuffer = (await drawCharacterImage()) as any;
      }

      if (!imageBuffer) throw new Error(tr('profile_NoImageData'));
      const drawEndTime = Date.now();

      const image = new AttachmentBuilder(imageBuffer, {
        name: `CharacterPage_${zzz.uid}.png`,
      });

      const userMindScape = (await database.get(`${interaction.user.id}.mindscape`)) ?? true;

      function chunkArray(array: any[], size: number) {
        return Array.from({ length: Math.ceil(array.length / size) }, (_, index) => array.slice(index * size, (index + 1) * size));
      }

      const characterOptions =
        characterId === 'main'
          ? characters.map((character) => ({
              emoji: emoji[elementId[Number(character.element)]],
              label: `${character.name}`,
              value: `${userId}-${character.id}`,
            }))
          : [
              {
                emoji: emoji.avatarIcon,
                label: tr('MainPage'),
                value: `${userId}-${accountIndex}-main`,
              },
              ...characters.map((character) => ({
                emoji: emoji[elementId[Number(character.element)]],
                label: `${character.name}`,
                description: `${tr('profile_CharactersFormat', {
                  level: character.level.toString(),
                  rank: character.rank.toString(),
                })}`,
                value: `${userId}-${accountIndex}-${character.id}`,
              })),
            ];

      const optionChunks = chunkArray(characterOptions, 25);

      const rowSelects = optionChunks.map((optionsChunk, index) =>
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          new StringSelectMenuBuilder()
            .setPlaceholder(`${tr('profile_SelectCharacter')} (${index + 1})`)
            .setCustomId(`profile_SelectCharacter-${index}`)
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions(...optionsChunk),
        ),
      );

      const rowMindScape = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('profile_CharacterMindScape')
          .setLabel(tr('MindScape'))
          .setStyle(userMindScape ? ButtonStyle.Success : ButtonStyle.Secondary),
      );

      const embed = new EmbedBuilder().setImage(`attachment://${image.name}`).setFooter({
        text: tr('TimeSpent', {
          requestTime: ((requestEndTime - requestStartTime) / 1000).toFixed(2),
          drawTime: ((drawEndTime - drawStartTime) / 1000).toFixed(2),
        }),
      });

      if (characterId != 'main') {
        embed.setColor(selectedCharacter.vertical_painting_color as ColorResolvable);
      }

      interaction.editReply({
        embeds: [embed],
        components: [...rowSelects, rowMindScape],
        files: [image],
      });
    } catch (error) {
      console.log(error);
      interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor('#E76161')
            .setTitle(tr('DrawError'))
            .setDescription(`\`${error}\``)
            .setThumbnail('https://static.wikia.nocookie.net/zenless-zone-zero/images/0/02/Sticker_Set_1_Anby_sob.png'),
        ],
      });
    }
  };

  drawQueue.push(drawTask);

  if (drawQueue.length !== 1) {
    drawInQueueReply(interaction, tr('DrawInQueue', { position: (drawQueue.length - 1).toString() }));
  }
}

async function handleAccountAction(interaction: StringSelectMenuInteraction) {
  const interactionCustomId = interaction.customId;
  switch (interactionCustomId) {
    case 'account_EditAccountSelect':
      return handleEditAccountSelect(interaction);
    case 'account_EditAccountSelectType':
      return handleEditAccountTypeSelect(interaction);
    case 'account_DeleteAccountSelect':
      return handleDeleteAccountSelect(interaction);
    case 'account_SetUserCookieSelect':
      return handleEditAccountCookieSelect(interaction);
  }
}

async function handleNewsAction(interaction: StringSelectMenuInteraction) {
  const interactionCustomId = interaction.customId;
  switch (interactionCustomId) {
    case 'news_post':
      return handleNewsPostSelect(interaction);
    case 'news_type':
      return handleNewsTypeSelect(interaction);
  }
}
