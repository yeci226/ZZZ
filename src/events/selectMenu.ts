import { commandTipContent } from "../utilities/core/commandTips.js";
import { isNewsInteraction } from "../utilities/news/wizard.js";
import { client } from "../index.js";
import { buildDiscLeaderboardEntry, recordDiscCharacters } from "../utilities/zzz/discLeaderboard.js";
import Logger from "../utilities/core/logger.js";
import {
  Events,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  EmbedBuilder,
  ModalBuilder,
  ButtonBuilder,
  ButtonStyle,
  TextInputBuilder,
  TextInputStyle,
  AttachmentBuilder,
  MessageFlags,
  BaseInteraction,
  ButtonInteraction,
  StringSelectMenuInteraction,
} from "discord.js";
import {
  getUserLang,
  getNewsList,
  getPostFull,
  parsePostContent,
  getRandomColor,
  getUserZZZData,
  drawInQueueReply,
  getUserHoyolabData,
} from "../utilities/utilities.js";
import { drawMainImage, drawCharacterImage } from "../utilities/zzz/profile.js";
import { loadProfileMainData } from "../utilities/zzz/profileMainData.js";
import { handleTeamDraw } from "../utilities/zzz/team.js";
import { createTranslator, toI18nLang } from "../utilities/core/i18n.js";
import Queue from "queue";
import {
  deleteLegacyAccountAtIndex,
  getLegacyAccounts,
  getLegacyAccountAtIndex,
} from "../utilities/accountStore.js";
import { unwrapProfileCharacter } from "../utilities/zzz/profileData.js";
import { buildCombatEntry } from "../utilities/zzz/combat/workbench.js";
import { normalizeZzzProfileStyle } from "../utilities/zzz/profileStyle.js";
import { buildProfileCharacterSelectRows } from "../utilities/zzz/profileCharacterSelectMenu.js";
import {
  extractProfileCharacterIdFromOptionValue,
  paginateProfileCharacters,
  parseProfileCharacterSelectCustomId,
  parseProfileMainPageCustomId,
  resolveProfileCharacterSelection,
} from "../utilities/zzz/profileCharacterSelect.js";
import { handleDeadlyDraw } from "../utilities/zzz/deadly.js";
import { formatSignalAction, signalActionText } from "../utilities/zzz/signalActionText.js";
import {
  DeadlyAssaultViewMode,
  parseDeadlyModeCustomId,
} from "../utilities/zzz/deadlyMode.js";
// Use client.db directly
const drawQueue = new Queue({ autostart: true });

client.on(Events.InteractionCreate, async (interaction: BaseInteraction) => {
  if ("customId" in interaction && typeof interaction.customId === "string" && isNewsInteraction(interaction.customId)) return;
  if (!interaction.isButton()) return;
  if (interaction.customId.startsWith("zdisc:")) return;
  if (interaction.customId.startsWith("zcombat:")) return;
  if ((interaction.customId.startsWith("settingui:") || interaction.customId.startsWith("reminder:")) || interaction.customId.startsWith("gsim:")) return;
  const buttonInteraction = interaction as ButtonInteraction;
  const { locale, customId } = buttonInteraction;
  const userLocale =
    (await getUserLang(buttonInteraction.user.id)) ||
    toI18nLang(locale) ||
    "en";
  const tr = createTranslator(userLocale);

  // Buttons that show a modal must NOT call deferUpdate first
  if (customId.startsWith("glog-import:")) {
    return buttonInteraction.reply({
      content: "這是舊版紀錄訊息，請改用 `/調頻 匯入`。",
      flags: MessageFlags.Ephemeral,
    });
  }
  if (customId.startsWith("gacha-url-")) {
    const { handleManualGachaImportButton } = await import("../utilities/zzz/manualGachaImportFlow.js");
    await handleManualGachaImportButton(buttonInteraction);
    return;
  }
  if (customId === "account_OpenEmailVerifyModal") {
    const { ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle } =
      await import("discord.js");
    const modal = new ModalBuilder()
      .setCustomId("account_EmailVerifyModal")
      .setTitle("輸入 Email 驗證碼")
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("emailCode")
            .setLabel("Hoyoverse 寄給你的 6 位數驗證碼")
            .setPlaceholder("123456")
            .setMinLength(6)
            .setMaxLength(6)
            .setStyle(TextInputStyle.Short)
            .setRequired(true),
        ),
      );
    return buttonInteraction.showModal(modal);
  }

  await buttonInteraction.deferUpdate().catch(() => {});

  if (customId.startsWith("profile_MainPage-")) {
    handleProfileMainPage(buttonInteraction, tr, userLocale);
  }

  if (["settings_togglePainting", "settings_toggleRankPainting", "settings_toggleGachaPublic", "settings_toggleGachaWeekly"].includes(customId)) {
    await handleSettingsToggle(buttonInteraction, customId, tr);
    return;
  }
  if (customId.startsWith("settings_confirmGachaClear:")) {
    handleGachaClearConfirm(buttonInteraction, customId);
  }
  if (customId.startsWith("settings_gachaArchivePage:")) {
    handleSettingsArchivePage(buttonInteraction, customId);
  }
  if (customId.startsWith("maze-page:") || customId.startsWith("maze-map-page:")) {
    handleMysteryMazeInteraction(buttonInteraction, customId);
  }
  if (customId.startsWith("glog-") || customId.startsWith("signal-open:")) {
    handleSignalLogButton(buttonInteraction, customId);
  }
  if (customId === "settings_cancelGachaClear") {
    await buttonInteraction.editReply({ content: "已取消清除。", embeds: [], components: [] });
  }
});

client.on(Events.InteractionCreate, async (interaction: BaseInteraction) => {
  if ("customId" in interaction && typeof interaction.customId === "string" && isNewsInteraction(interaction.customId)) return;
  if (!interaction.isStringSelectMenu()) return;
  if (interaction.customId.startsWith("zdisc:")) return;
  if (interaction.customId.startsWith("zcombat:")) return;
  if ((interaction.customId.startsWith("settingui:") || interaction.customId.startsWith("reminder:"))) return;
  const selectInteraction = interaction as StringSelectMenuInteraction;
  const { locale, customId, values } = selectInteraction;
  const userLocale =
    (await getUserLang(selectInteraction.user.id)) ||
    toI18nLang(locale) ||
    "en";
  const tr = createTranslator(userLocale);

  if (customId.startsWith("rng-import-profile:")) {
    const { handleRngMoeProfileSelect } = await import("../utilities/zzz/rngMoeImportFlow.js");
    await handleRngMoeProfileSelect(selectInteraction);
    return;
  }

  if (!customId.startsWith("account"))
    await selectInteraction.deferUpdate().catch(() => {});
  if (customId.startsWith("news")) handleNews(selectInteraction, tr, values[0]);
  if (customId.startsWith("account"))
    handleAccountAction(selectInteraction, tr, customId, values[0]);
  if (customId.startsWith("profile_SelectCharacter"))
    handleSelectCharacter(selectInteraction, tr, values, userLocale);
  if (customId === "settings_selectLocale") {
    await handleSettingsLocale(selectInteraction, values[0], tr);
    return;
  }
  if (customId === "settings_selectProfileStyle") {
    await handleSettingsProfileStyle(selectInteraction, values[0], tr);
    return;
  }

  if (customId === "settings_selectGachaClear")
    handleGachaClearSelect(selectInteraction, values[0]);
  if (customId.startsWith("maze-map:") || customId.startsWith("maze-difficulty:"))
    handleMysteryMazeInteraction(selectInteraction, customId, values[0]);
  if (customId.startsWith("deadly-mode:"))
    handleDeadlyModeSelect(
      selectInteraction,
      tr,
      userLocale,
      customId,
      values[0],
    );
  if (customId.startsWith("glog-")) {
    const { handleSignalLogComponent } = await import("../utilities/zzz/signalLogView.js");
    await handleSignalLogComponent(selectInteraction);
  }
});

async function handleSignalLogButton(interaction: ButtonInteraction, customId: string) {
  const locale = (await getUserLang(interaction.user.id)) || "tw";
  const actionCopy = signalActionText(locale);
  try {
    if (customId.startsWith("signal-open:")) {
      const [, invokerId, ownerId, accountIndexRaw, rawSource] = customId.split(":");
      if (interaction.user.id !== invokerId) {
        await interaction.followUp({ content: actionCopy.onlyInvoker, flags: MessageFlags.Ephemeral });
        return;
      }
      const source = rawSource === "manual" ? "manual" : "official";
      if (!(await (await import("../utilities/zzz/gachaPrivacy.js")).canViewPrivateGacha(client.db, interaction.user.id, ownerId!))) {
        await interaction.followUp({ content: actionCopy.privateDisabled, flags: MessageFlags.Ephemeral });
        return;
      }
      const tr = createTranslator(locale);
      const accountIndex = Math.max(0, Number(accountIndexRaw) || 0);
      const account = await getLegacyAccountAtIndex(client.db, ownerId!, accountIndex);
      const uid = String(account?.uid ?? "");
      const { getGachaArchiveStore } = await import("../utilities/zzz/gachaArchive.js");
      const hasArchive = !!uid && getGachaArchiveStore().countRecords({ ownerId: ownerId!, uid }) > 0;
      const zzz = await getUserZZZData(interaction as any, tr, ownerId!, locale, accountIndex, { authMode: hasArchive ? "optional" : "required" });
      if (!zzz && !hasArchive) return;
      const { createSignalLogSession, buildSignalLogMessage } = await import("../utilities/zzz/signalLogView.js");
      const session = await createSignalLogSession({
        interaction: interaction as any, ownerId: ownerId!, accountIndex, source, zzz,
        uid: String(zzz?.uid ?? uid), playerName: account?.nickname ?? (zzz as any)?.nickname,
        linked: !!account, region: String(account?.region ?? (zzz as any)?.region ?? ""),
      });
      await interaction.editReply({ ...(await buildSignalLogMessage(session)), attachments: [] });
      return;
    }
    const { handleSignalLogComponent } = await import("../utilities/zzz/signalLogView.js");
    await handleSignalLogComponent(interaction);
  } catch (error: any) {
    await interaction.followUp({
      content: formatSignalAction(actionCopy.updateFailed, { error: `\`${String(error?.message || error)}\`` }),
      flags: MessageFlags.Ephemeral,
    });
  }
}

async function handleDeadlyModeSelect(
  interaction: StringSelectMenuInteraction,
  tr: any,
  userLocale: string,
  customId: string,
  rawMode: string,
) {
  const context = parseDeadlyModeCustomId(customId);
  if (!context) return;

  if (interaction.user.id !== context.ownerId) {
    await interaction.followUp({
      content: "只有發起指令的使用者可以切換模式。",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const mode: DeadlyAssaultViewMode =
    rawMode === "extreme" ? "extreme" : "normal";
  const zzz = await getUserZZZData(
    interaction as any,
    tr,
    context.targetUserId,
    userLocale,
    context.accountIndex,
  );
  if (!zzz) return;

  // 全域 StringSelect handler 已 deferUpdate；此處直接重抓 API 並更新原訊息。
  await handleDeadlyDraw(
    interaction,
    tr,
    zzz,
    context.schedule,
    context,
    mode,
  );
}

async function handleSettingsToggle(
  interaction: ButtonInteraction,
  customId: string,
  tr: any,
) {
  const userId = interaction.user.id;
  const keyById: Record<string, string> = {
    settings_togglePainting: "paintingMode",
    settings_toggleRankPainting: "rankPainting",
    settings_toggleGachaPublic: "gachaPublic",
    settings_toggleGachaWeekly: "gachaWeeklyArchive",
  };
  const dbKey = `${userId}.${keyById[customId]}`;
  const defaultValue = customId === "settings_toggleGachaPublic";
  const current: boolean = (await client.db.get(dbKey)) ?? defaultValue;
  await client.db.set(dbKey, !current);
  if (customId === "settings_toggleGachaWeekly") {
    const { getGachaArchiveStore } = await import("../utilities/zzz/gachaArchive.js");
    const { reconcileWeeklyArchiveAccounts } = await import("../utilities/zzz/gachaArchiveMaintenance.js");
    reconcileWeeklyArchiveAccounts(
      userId,
      !current,
      await getLegacyAccounts(client.db as any, userId),
      getGachaArchiveStore(),
    );
  }

  const { openGeneralSettings } = await import("../utilities/settings/general.js");
  await openGeneralSettings(client, interaction, client.db);
}

async function handleGachaClearSelect(
  interaction: StringSelectMenuInteraction,
  value: string,
) {
  const split = value.lastIndexOf(":");
  const uid = value.slice(0, split);
  const source = value.slice(split + 1);
  if (!uid || !["official", "manual", "all"].includes(source)) return;
  if (source !== "all") {
    await interaction.followUp({
      content: "這是舊版設定訊息，請重新執行 `/設定` 後清除該 UID 的完整紀錄。",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  await interaction.followUp({
    flags: MessageFlags.Ephemeral,
    embeds: [new EmbedBuilder()
      .setColor("#E76161")
      .setTitle("確認刪除抽卡紀錄")
      .setDescription(`UID \`${uid}\` 已儲存在機器人的全部抽卡紀錄會永久刪除，且無法復原。此操作不會更動遊戲帳號。`)],
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`settings_confirmGachaClear:${uid}:${source}`)
        .setLabel("永久清除").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId("settings_cancelGachaClear")
        .setLabel("取消").setStyle(ButtonStyle.Secondary),
    )],
  });
}

async function handleGachaClearConfirm(
  interaction: ButtonInteraction,
  customId: string,
) {
  const [, uid, rawSource] = customId.split(":");
  if (!uid || !["official", "manual", "all"].includes(rawSource)) return;
  if (rawSource !== "all") {
    await interaction.editReply({
      content: "這是舊版設定訊息，請重新執行 `/設定` 後清除該 UID 的完整紀錄。",
      embeds: [],
      components: [],
    });
    return;
  }
  const { getGachaArchiveStore } = await import("../utilities/zzz/gachaArchive.js");
  const removed = getGachaArchiveStore().clear(interaction.user.id, uid);
  await interaction.editReply({
    content: removed ? `已永久清除 UID \`${uid}\` 已儲存在機器人的抽卡紀錄。` : "找不到這個帳號已儲存的抽卡紀錄。",
    embeds: [],
    components: [],
  });
}

async function handleSettingsArchivePage(
  interaction: ButtonInteraction,
  customId: string,
) {
  const page = Math.max(0, Number(customId.split(":")[1]) || 0);
  const { openGeneralSettings } = await import("../utilities/settings/general.js");
  await openGeneralSettings(client, interaction, client.db, page);
}

async function handleMysteryMazeInteraction(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
  customId: string,
  selected?: string,
) {
  const { parseMysteryMazeContext, buildMysteryMazeMessage } =
    await import("../utilities/zzz/mysteryMazeView.js");
  const context = parseMysteryMazeContext(customId);
  if (!context) return;
  if (interaction.user.id !== context.invokerId) {
    await interaction.followUp({ content: "只有發起指令的使用者可以操作這份迷宮紀錄。", flags: MessageFlags.Ephemeral });
    return;
  }
  if (customId.startsWith("maze-map:")) {
    context.mapId = selected || "0";
    context.page = 0;
  }
  if (customId.startsWith("maze-difficulty:")) {
    context.difficulty = Number(selected) || 0;
    context.page = 0;
  }
  if (customId.startsWith("maze-map-page:")) {
    context.mapPage = Math.max(0, context.mapPage ?? 0);
  }
  const locale = (await getUserLang(interaction.user.id)) || "tw";
  const tr = createTranslator(locale);
  try {
    const payload = await buildMysteryMazeMessage(interaction, tr, locale, context);
    if (payload) await interaction.editReply({ ...payload, attachments: [] });
  } catch (error: any) {
    await interaction.followUp({
      content: `迷宮詭域更新失敗：\`${String(error?.message || error)}\``,
      flags: MessageFlags.Ephemeral,
    });
  }
}

async function handleSettingsLocale(
  interaction: StringSelectMenuInteraction,
  locale: string,
  _tr: any,
) {
  const userId = interaction.user.id;
  await client.db.set(`${userId}.locale`, locale);

  const { openGeneralSettings } = await import("../utilities/settings/general.js");
  await openGeneralSettings(client, interaction, client.db);
}

async function handleSettingsProfileStyle(
  interaction: StringSelectMenuInteraction,
  rawStyle: string,
  _tr: any,
) {
  const userId = interaction.user.id;
  const profileStyle = normalizeZzzProfileStyle(rawStyle);
  await client.db.set(`${userId}.profileStyle`, profileStyle);

  const { openGeneralSettings } = await import("../utilities/settings/general.js");
  await openGeneralSettings(client, interaction, client.db);
}

async function handleProfileMainPage(
  interaction: ButtonInteraction,
  tr: any,
  userLocale: string,
) {
  try {
    const context = parseProfileMainPageCustomId(interaction.customId);
    if (!context) return;
    const { targetUserId: userId, accountIndex } = context;
    const zzz = await getUserZZZData(
      interaction as any,
      tr,
      userId,
      userLocale,
      accountIndex,
    );
    if (!zzz) return;

    const data = await loadProfileMainData(zzz, {
      targetUserId: userId,
      accountIndex,
      locale: userLocale,
      loadAccount: (target, locale, index) =>
        getUserHoyolabData(interaction as any, tr, target, locale, index),
    });
    const characters = data.characters;
    const imageBuffer = await drawMainImage(tr, userLocale, data);
    if (!imageBuffer) throw new Error(tr("profile_NoImageData"));

    const image = new AttachmentBuilder(imageBuffer as Buffer, {
      name: `MainImage_${zzz.uid}.png`,
    });
    const rowSelects = buildProfileCharacterSelectRows(
      tr,
      characters,
      userId,
      accountIndex,
    );

    await interaction.editReply({
      embeds: [],
      components: rowSelects,
      files: [image],
    });
  } catch (error) {
    console.log(error);
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor("#E76161")
          .setTitle(tr("DrawError"))
          .setDescription(`\`${(error as Error).message}\``),
      ],
    });
  }
}

async function handleSelectCharacter(
  interaction: StringSelectMenuInteraction,
  tr: any,
  values: string[],
  userLocale: string,
) {
  const selectContext = parseProfileCharacterSelectCustomId(
    interaction.customId,
  );
  const drawTask = async () => {
    try {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferUpdate().catch(() => {});
      }
      const firstCharacterValue =
        values.find(
          (value) =>
            extractProfileCharacterIdFromOptionValue(value) !== null,
        ) ?? "";
      const legacyParts = firstCharacterValue
        .split("-")
        .map((value) => value.trim());
      const userId = selectContext?.targetUserId ?? legacyParts[0] ?? "";
      const accountIndex =
        selectContext?.accountIndex ?? Number(legacyParts[1] ?? 0);
      if (!userId || !Number.isInteger(accountIndex)) {
        throw new Error(tr("AccountNotFound") || "Account not found");
      }

      const zzz = await getUserZZZData(
        interaction as any,
        tr,
        userId,
        userLocale,
        accountIndex,
      );
      if (!zzz) return;

      const characters = await zzz.record.characters();
      let currentPage = selectContext?.page ?? 0;
      let selectedCharacterIds: string[];

      if (selectContext) {
        const pages = paginateProfileCharacters(characters);
        const resolution = resolveProfileCharacterSelection(
          pages,
          selectContext.page,
          selectContext.selectedCharacterIds,
          values,
        );

        if (resolution.kind !== "submit") {
          await interaction.editReply({
            components: buildProfileCharacterSelectRows(
              tr,
              characters,
              userId,
              accountIndex,
              resolution.page,
              resolution.selectedCharacterIds,
            ),
          });

          if (resolution.kind === "navigation-conflict") {
            await interaction.followUp({
              content:
                tr("profile_SelectCharacterNavigationConflict") ||
                "請一次只選擇上一頁或下一頁。",
              flags: MessageFlags.Ephemeral,
            });
          } else if (resolution.kind === "too-many") {
            await interaction.followUp({
              content:
                tr("profile_SelectCharacterTooMany") ||
                "最多只能選擇三位角色。",
              flags: MessageFlags.Ephemeral,
            });
          } else if (resolution.kind === "empty") {
            await interaction.followUp({
              content:
                tr("profile_SelectCharacterRequired") ||
                "請至少選擇一位角色。",
              flags: MessageFlags.Ephemeral,
            });
          }
          return;
        }

        currentPage = resolution.page;
        selectedCharacterIds = resolution.selectedCharacterIds;
      } else {
        selectedCharacterIds = values
          .map(extractProfileCharacterIdFromOptionValue)
          .filter((value): value is string => value !== null);
      }

      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle(tr("Searching"))
            .setImage(
              "https://static.wikia.nocookie.net/zenless-zone-zero/images/b/bb/Bangboo_Net_Loading.gif",
            ),
        ],
        components: [],
      });

      // Read painting preferences saved when /profile was invoked
      const usePainting: boolean =
        (await client.db.get(`${interaction.user.id}.paintingMode`)) ?? false;
      const rankPainting: boolean =
        (await client.db.get(`${interaction.user.id}.rankPainting`)) ?? false;
      const profileStyle = normalizeZzzProfileStyle(
        await client.db.get(`${interaction.user.id}.profileStyle`),
      );

      // ── Multi-select (2–3 agents) → Team view ──
      const agentIds = selectedCharacterIds.filter((id) => id !== "main");
      if (agentIds.length >= 2) {
        const rowSelects = buildProfileCharacterSelectRows(
          tr,
          characters,
          userId,
          accountIndex,
          currentPage,
        );
        const rowButtons = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`profile_MainPage-${userId}-${accountIndex}`)
            .setLabel(tr("MainPage"))
            .setStyle(ButtonStyle.Secondary),
        ) as any;
        handleTeamDraw(
          interaction as any,
          tr,
          zzz,
          agentIds,
          null,
          usePainting,
          rankPainting,
          [...rowSelects, rowButtons],
          profileStyle,
          userId,
        );
        return;
      }

      // ── Single select → Profile view ──
      const characterId = selectedCharacterIds[0];
      if (!characterId) throw new Error(tr("AccountNotFound"));
      let selectedCharacter = null;

      if (characterId !== "main") {
        // Use the same record.character() path as the multi-character view so
        // the full payload (including rank/cinema) reaches the renderer.
        const record = zzz.record as any;
        const characterResult = await record.character(Number(characterId));
        selectedCharacter = unwrapProfileCharacter(characterResult);
      }

      let imageBuffer;

      if (characterId == "main") {
        const data = await loadProfileMainData(zzz, {
          targetUserId: userId,
          accountIndex,
          locale: userLocale,
          characters,
          loadAccount: (target, locale, index) =>
            getUserHoyolabData(interaction as any, tr, target, locale, index),
        });
        imageBuffer = await drawMainImage(tr, userLocale, data);
      } else {
        if (!selectedCharacter) throw new Error(tr("AccountNotFound"));

        imageBuffer = await drawCharacterImage(
          interaction,
          tr,
          userLocale,
          String(zzz.uid || ""),
          selectedCharacter,
          usePainting,
          rankPainting,
          profileStyle,
        );
      }

      if (!imageBuffer) throw new Error(tr("profile_NoImageData"));
      const drawEndTime = Date.now();

      const image = new AttachmentBuilder(imageBuffer as Buffer, {
        name: `CharacterPage_${zzz.uid}.png`,
      });

      // ── Build character options (no "main" entry — main is a button) ──
      const rowSelects = buildProfileCharacterSelectRows(
        tr,
        characters,
        userId,
        accountIndex,
        currentPage,
      );

      // ── Single-character view only needs a Homepage button. ──
      const components: any[] = [...rowSelects];
      if (selectedCharacter) components.push(...buildCombatEntry(interaction.user.id, userLocale, [selectedCharacter]));
      if (selectedCharacter) components.push(...buildDiscLeaderboardEntry([selectedCharacter], userLocale));
      if (characterId !== "main") {
        components.push(
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`profile_MainPage-${userId}-${accountIndex}`)
              .setLabel(tr("MainPage"))
              .setStyle(ButtonStyle.Secondary),
          ) as any,
        );
      }

      await interaction.editReply({
        content: commandTipContent(interaction, "profile", userLocale, selectedCharacter ? recordDiscCharacters(interaction, userId, String(zzz.uid || ""), [selectedCharacter], userLocale) : ""),
        embeds: [],
        components,
        files: [image],
      });
    } catch (error) {
      console.log(error);
      new Logger("系統").warn(`警告訊息：${error}`);
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor("#E76161")
            .setTitle(tr("DrawError"))
            .setDescription(`\`${(error as Error).message}\``)
            .setThumbnail(
              "https://static.wikia.nocookie.net/zenless-zone-zero/images/0/02/Sticker_Set_1_Anby_sob.png",
            ),
        ],
      });
    }
  };

  drawQueue.push(drawTask);

  if (drawQueue.length !== 1) {
    drawInQueueReply(
      interaction as any,
      tr("DrawInQueue", { position: drawQueue.length - 1 }),
    );
  }
}

async function handleAccountAction(
  interaction: StringSelectMenuInteraction,
  tr: any,
  customId: string,
  value: string,
) {
  const account = await getLegacyAccounts(
    client.db as any,
    interaction.user.id,
  );
  if (!account)
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setConfig("#E76161", "sob")
          .setTitle(`${tr("account_nonAcc")}`),
      ],
      flags: MessageFlags.Ephemeral,
    });

  if (customId == "account_EditAccountSelect") {
    await interaction.deferUpdate().catch(() => {});
    const accountIndex = value;
    interaction.editReply({
      components: [
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setPlaceholder(tr("account_SelectAccountEdit"))
            .setCustomId("account_EditAccountSelectType")
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions(
              {
                label: "UID",
                value: `uid-${accountIndex}`,
              },
              {
                label: "Cookie",
                value: `cookie-${accountIndex}`,
              },
            ),
        ) as any,
      ],
      flags: MessageFlags.Ephemeral as any,
    });
    return;
  } else if (customId == "account_EditAccountSelectType") {
    const [type, accountIndex] = value.split("-");
    const accountData = account[Number(accountIndex)];

    if (type == "uid") {
      await interaction.showModal(
        new ModalBuilder()
          .setCustomId(`accountEdit-${accountIndex}`)
          .setTitle(tr("account_SetUserID"))
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("uid")
                .setLabel(tr("account_SetUserIDDesc"))
                .setValue(accountData.uid || "")
                .setPlaceholder("e.g. 809279679")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMinLength(9)
                .setMaxLength(10),
            ) as any,
          ),
      );
    } else if (type == "cookie") {
      const userAccountCookie = accountData.cookie || "";
      const parseCookie = (cookie: string, key: string) => {
        const match = cookie.match(new RegExp(`${key}=([^;]+)`));
        return match?.[1]?.trim() ?? "";
      };

      const ltokenV2 = parseCookie(userAccountCookie, "ltoken_v2");
      const ltuidV2 = parseCookie(userAccountCookie, "ltuid_v2");
      const cookieTokenV2 = parseCookie(userAccountCookie, "cookie_token_v2");
      const accountMidV2 = parseCookie(userAccountCookie, "account_mid_v2");

      await interaction.showModal(
        new ModalBuilder()
          .setCustomId(`cookie_set-${accountIndex}`)
          .setTitle(tr("account_SetUserCookie"))
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("ltoken_v2")
                .setLabel("ltoken_v2")
                .setValue(ltokenV2)
                .setStyle(TextInputStyle.Short)
                .setRequired(true),
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("ltuid_v2")
                .setLabel("ltuid_v2")
                .setValue(ltuidV2)
                .setStyle(TextInputStyle.Short)
                .setRequired(true),
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("cookie_token_v2")
                .setLabel("cookie_token_v2")
                .setValue(cookieTokenV2)
                .setStyle(TextInputStyle.Short)
                .setRequired(true),
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("account_mid_v2")
                .setLabel("account_mid_v2")
                .setValue(accountMidV2)
                .setStyle(TextInputStyle.Short)
                .setRequired(true),
            ) as any,
          ),
      );
    }
  } else if (interaction.customId == "account_DeleteAccountSelect") {
    await interaction.deferUpdate().catch(() => {});
    const accountIndex = value;
    const removed = await deleteLegacyAccountAtIndex(
      client.db as any,
      interaction.user.id,
      parseInt(accountIndex),
    );
    if (!removed) return;
    const uid = removed.uid;

    interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setConfig("#F6F1F1", "wiggle")
          .setTitle(`${tr("account_DeletedSuccess")} \`${uid}\``),
      ],
      components: [],
      flags: MessageFlags.Ephemeral as any,
    });
    return;
  } else if (interaction.customId == "account_SetUserCookieSelect") {
    const accountIndex = value;
    const userAccountCookie = account[Number(accountIndex)].cookie || "";
    const parseCookie = (cookie: string, key: string) => {
      const match = cookie.match(new RegExp(`${key}=([^;]+)`));
      return match?.[1]?.trim() ?? "";
    };

    const ltokenV2 = parseCookie(userAccountCookie, "ltoken_v2");
    const ltuidV2 = parseCookie(userAccountCookie, "ltuid_v2");
    const cookieTokenV2 = parseCookie(userAccountCookie, "cookie_token_v2");
    const accountMidV2 = parseCookie(userAccountCookie, "account_mid_v2");

    await interaction.showModal(
      new ModalBuilder()
        .setCustomId(`cookie_set-${accountIndex}`)
        .setTitle(tr("account_SetUserCookie"))
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("ltoken_v2")
              .setLabel("ltoken_v2")
              .setValue(ltokenV2)
              .setStyle(TextInputStyle.Short)
              .setRequired(true),
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("ltuid_v2")
              .setLabel("ltuid_v2")
              .setValue(ltuidV2)
              .setStyle(TextInputStyle.Short)
              .setRequired(true),
          ) as any,
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("cookie_token_v2")
              .setLabel("cookie_token_v2")
              .setValue(cookieTokenV2)
              .setStyle(TextInputStyle.Short)
              .setRequired(true),
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("account_mid_v2")
              .setLabel("account_mid_v2")
              .setValue(accountMidV2)
              .setStyle(TextInputStyle.Short)
              .setRequired(true),
          ),
        ) as any,
    );
  }
}

async function handleNews(
  interaction: StringSelectMenuInteraction,
  tr: any,
  value: string,
) {
  if (interaction.customId == "news_type") {
    const type = value;
    const newsData = await getNewsList(
      interaction.locale.toLowerCase(),
      parseInt(type),
    );

    return interaction.editReply({
      components: [
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setPlaceholder(tr("news_SelectPost"))
            .setCustomId("news_post")
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions(
              newsData.data.list.map((data: any, i: number) => {
                const date = new Date(data.post.created_at * 1000);
                return {
                  label: `${
                    data.post.subject.length < 100
                      ? data.post.subject
                      : data.post.subject.slice(0, 97).concat("...")
                  }`,
                  description:
                    date.getUTCFullYear() +
                    tr("Year") +
                    (date.getUTCMonth() + 1) +
                    tr("Month") +
                    date.getUTCDate() +
                    tr("Day"),
                  value: `${data.post.post_id}`,
                };
              }),
            ),
        ) as any,
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setPlaceholder(tr("news_SelectType"))
            .setCustomId("news_type")
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions(
              {
                label: tr("news_Notice"),
                emoji: "🔔",
                value: "1",
              },
              {
                label: tr("news_Events"),
                emoji: "🔥",
                value: "2",
              },
              {
                label: tr("news_Info"),
                emoji: "🗞️",
                value: "3",
              },
            ),
        ),
      ],
    });
  } else if (interaction.customId == "news_post") {
    const postId = value;
    const postData = await getPostFull(
      interaction.locale.toLowerCase(),
      postId,
    );
    const { post, user, image_list, cover_list } = postData.post;
    const content = await parsePostContent(post.content);
    const date = new Date(post.created_at * 1000);

    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(getRandomColor() as any)
          .setAuthor({
            iconURL: user.avatar_url ?? "",
            name: user.nickname ?? "",
            url: `https://www.hoyolab.com/accountCenter?id=${user.uid}`,
          })
          .setTitle(post.subject ?? tr("None"))
          .setURL(`https://www.hoyolab.com/article/${post.post_id}`)
          .setDescription(
            content.length < 4096
              ? content
              : (content.slice(0, 4096 - 3).concat("...") ?? tr("None")),
          )
          .setFooter({
            text:
              date.getUTCFullYear() +
              tr("Year") +
              (date.getUTCMonth() + 1) +
              tr("Month") +
              date.getUTCDate() +
              tr("Day"),
          })
          .setImage(image_list[0]?.url ?? cover_list[0]?.url),
      ],
    });
  }
}
