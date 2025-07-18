import axios from 'axios';
import { ActionRowBuilder, AttachmentBuilder, ChatInputCommandInteraction, EmbedBuilder, MessageFlags, ModalBuilder, ModalSubmitInteraction, TextInputBuilder, TextInputStyle } from 'discord.js';
import { LanguageEnum } from '@yeci226/hoyoapi';

import { discordToHoyolabLang, failedReply, getRandomColor, getUserLang, setupDefaultLang } from '@/utilities';
import { createTranslator } from '@/utilities/core/i18n';

import { handleSignalLogDraw } from '@/renderers/gacha';

export const standardCharacterIds = ['1021', '1041', '1101', '1141', '1181', '1211'];
export const standardWeaponIds = ['14104', '14102', '14110', '14114', '14121', '14118'];

export type SignalData = {
  id: number;
  name: string;
  type: string;
  time: number;
  rank: string;
};

export type SignalDataDetail = {
  total: number;
  average: number;
  pity: number;
  data: SignalData[];
  limitedPullsAverage: number;
};

export enum GachaType {
  REGULAR = 'regular',
  CHARACTER = 'character',
  WEAPON = 'weapon',
  BANGBOO = 'bangboo',
}

export async function handleHowToGetGachaLogCommand(interaction: ChatInputCommandInteraction) {
  const interactionUser = interaction.user;
  const interactionLocale = interaction.locale;

  const userLocale = (await getUserLang(interactionUser.id)) || (await setupDefaultLang(interactionUser.id, discordToHoyolabLang(interactionLocale)));
  const tr = createTranslator(userLocale);

  return interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(getRandomColor())
        .setTitle(tr('gacha_HowToGet'))
        .setDescription(
          tr('gacha_HowToGetDesc', {
            z: `\`\`\`powershell\nStart-Process powershell -Verb runAs -ArgumentList '-NoExit -Command "Invoke-Expression  (New-Object Net.WebClient).DownloadString(\\"https://raw.githubusercontent.com/yeci226/ZZZ-ToS-PP/main/getSignal.ps1\\")"'\n\`\`\``,
          }),
        ),
    ],
    flags: MessageFlags.Ephemeral,
  });
}

export async function handleGachaDrawCommand(interaction: ChatInputCommandInteraction) {
  const interactionUser = interaction.user;
  const interactionLocale = interaction.locale;
  const interactionOptions = interaction.options;

  const userLocale = (await getUserLang(interactionUser.id)) || (await setupDefaultLang(interactionUser.id, discordToHoyolabLang(interactionLocale)));
  const tr = createTranslator(userLocale);

  return interaction.showModal(
    new ModalBuilder()
      .setCustomId('signal_log')
      .setTitle(tr('gacha_LogTitle'))
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder().setCustomId('signalUrl').setLabel(tr('gacha_LogDesc')).setPlaceholder('URL').setStyle(TextInputStyle.Paragraph).setRequired(true).setMinLength(50).setMaxLength(4000),
        ),
      ),
  );
}

export async function handleGachaLogSubmit(interaction: ModalSubmitInteraction) {
  const interactionUser = interaction.user;
  const interactionLocale = interaction.locale;
  const interactionFields = interaction.fields;

  const userLocale = (await getUserLang(interactionUser.id)) || (await setupDefaultLang(interactionUser.id, discordToHoyolabLang(interactionLocale)));
  const tr = createTranslator(userLocale);

  try {
    await interaction.deferReply();

    const url = interactionFields.getTextInputValue('signalUrl');

    if (url === '') {
      return failedReply(interaction, tr('gacha_NoSignal'), tr('gacha_NoSignalDesc'));
    }

    const buffer = await handleSignalLogDraw(userLocale, {
      signalUrl: url,
    });

    if (!buffer) {
      return failedReply(interaction, tr('gacha_NoSignal'), tr('gacha_NoSignalDesc'));
    }

    const image = new AttachmentBuilder(Buffer.from(buffer), {
      name: `gacha_${interactionUser.id}.png`,
    });

    return interaction.editReply({
      embeds: [new EmbedBuilder().setColor(getRandomColor()).setTitle(tr('gacha_Success')).setDescription(tr('gacha_SuccessDesc')).setImage(`attachment://${image.name}`)],
      files: [image],
    });
  } catch (error: any) {
    return failedReply(interaction, tr('gacha_Failed'), tr('gacha_FailedDesc'), error.message);
  }
}

export async function fetchSignalData(query: URLSearchParams, id: number, endId: number) {
  query.set('real_gacha_type', id.toString());
  query.set('end_id', endId.toString());

  const response = await axios.get('https://public-operation-nap-sg.hoyoverse.com/common/gacha_record/api/getGachaLog?' + query);

  return response.data as {
    data: {
      list: {
        id: number;
        name: string;
        item_id: number;
        item_type: string;
        rank_type: string;
        time: number;
      }[];
    };
  };
}

export async function getSingalLog(input: string, userLocale: LanguageEnum) {
  const baseQueryParams = new URLSearchParams({
    authkey_ver: '1',
    sign_type: '2',
    game_biz: 'nap_global',
    lang: userLocale,
    authkey: '',
    region: 'tw',
    real_gacha_type: '0',
    size: '20',
    end_id: '0',
  });

  const gachaTypes: Record<GachaType, number> = {
    [GachaType.REGULAR]: 1,
    [GachaType.CHARACTER]: 2,
    [GachaType.WEAPON]: 3,
    [GachaType.BANGBOO]: 5,
  };

  const inputParams = new URLSearchParams(input);
  const authkey = inputParams.get('authkey') ?? '';
  const lastId = inputParams.get('end_id') ?? '0';
  if (!authkey) return null;

  const query = new URLSearchParams(baseQueryParams);
  query.set('authkey', authkey);

  const allSignalDatas: { [key in GachaType]: SignalData[] } = {
    character: [],
    weapon: [],
    regular: [],
    bangboo: [],
  };
  const allSignalSRankDetail: { [key in GachaType]: SignalDataDetail } = {
    character: { total: 0, average: 0, pity: 0, data: [], limitedPullsAverage: 0 },
    weapon: { total: 0, average: 0, pity: 0, data: [], limitedPullsAverage: 0 },
    regular: { total: 0, average: 0, pity: 0, data: [], limitedPullsAverage: 0 },
    bangboo: { total: 0, average: 0, pity: 0, data: [], limitedPullsAverage: 0 },
  };

  for (const [gachaType, id] of Object.entries(gachaTypes) as [GachaType, number][]) {
    let endId = 0;
    const temp = [];

    while (true) {
      const signalData = await fetchSignalData(query, id, endId);
      if (!signalData?.data || !signalData.data.list.length) break;
      const list = signalData.data.list;
      const reachedLastId = list.some((signal) => signal.id == parseInt(lastId));
      temp.push(
        ...list.map((signal) => ({
          id: signal.item_id,
          name: signal.name.toLowerCase().replace(/\s+/g, '_'),
          type: signal.item_type.toLowerCase().replace(/\s+/g, '_'),
          time: signal.time,
          rank: signal.rank_type == '4' ? 'S' : signal.rank_type == '3' ? 'A' : 'B',
        })),
      );

      if (reachedLastId) break;
      else endId = list[list.length - 1].id;

      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    allSignalDatas[gachaType] = temp;
  }

  for (const [type, signalData] of Object.entries(allSignalDatas) as [GachaType, SignalData[]][]) {
    const totalPulls = signalData.length;

    // 計算 S 等級的抽卡次數
    let pity = 0;
    const data = signalData.reduce(
      (acc, item) => {
        pity++;
        if (item.rank === 'S') {
          acc.push({ ...item, pity });
          pity = 0;
        }
        return acc;
      },
      [] as { id: number; name: string; type: string; time: number; rank: string; pity: number }[],
    );

    allSignalSRankDetail[type].data = data.reverse();
    allSignalSRankDetail[type].pity = pity;
    allSignalSRankDetail[type].average = data.length > 1 ? parseFloat((data.reduce((acc, i) => acc + i.pity, 0) / data.length).toFixed(2)) : 0;
    allSignalSRankDetail[type].total = totalPulls;
    allSignalSRankDetail[type].data.unshift({} as SignalData); // Add blank data for showing pities

    if (type === 'character' || type === 'weapon') {
      const limitedPullSegments: number[] = data.reduce((acc: number[], item) => ([...standardCharacterIds, ...standardWeaponIds].includes(item.id.toString()) ? [...acc, item.pity] : acc), []);
      const avg = limitedPullSegments.length > 0 ? totalPulls / limitedPullSegments.length : 0;
      allSignalSRankDetail[type].limitedPullsAverage = parseFloat(avg.toFixed(2));
    } else {
      allSignalSRankDetail[type].limitedPullsAverage = 0;
    }
  }
  return allSignalSRankDetail;
}
