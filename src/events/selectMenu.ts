import { client } from "../index.js";
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
import { handleTeamDraw } from "../utilities/zzz/team.js";
import { createTranslator, toI18nLang } from "../utilities/core/i18n.js";
import Queue from "queue";
import {
  deleteLegacyAccountAtIndex,
  getLegacyAccounts,
} from "../utilities/accountStore.js";
import { unwrapProfileCharacter } from "../utilities/zzz/profileData.js";
import { normalizeZzzProfileStyle } from "../utilities/zzz/profileStyle.js";
import { buildProfileCharacterSelectRows } from "../utilities/zzz/profileCharacterSelectMenu.js";
import {
  extractProfileCharacterIdFromOptionValue,
  paginateProfileCharacters,
  parseProfileCharacterSelectCustomId,
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
  if (!interaction.isButton()) return;
  const buttonInteraction = interaction as ButtonInteraction;
  const { locale, customId } = buttonInteraction;
  const userLocale =
    (await getUserLang(buttonInteraction.user.id)) ||
    toI18nLang(locale) ||
    "en";
  const tr = createTranslator(userLocale);

  // Buttons that show a modal must NOT call deferUpdate first
  if (customId.startsWith("glog-import:")) {
    const { getSignalLogSession } = await import("../utilities/zzz/signalLogView.js");
    const session = getSignalLogSession(customId);
    const actionCopy = signalActionText(session?.locale ?? userLocale);
    if (!session || session.invokerId !== buttonInteraction.user.id || session.ownerId !== buttonInteraction.user.id) {
      return buttonInteraction.reply({ content: actionCopy.modalDenied, flags: MessageFlags.Ephemeral });
    }
    return buttonInteraction.showModal(
      new ModalBuilder().setCustomId(`glog-import:${session.token}`).setTitle(actionCopy.modalTitle).addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder().setCustomId("signalUrl").setLabel(actionCopy.modalUrlLabel)
            .setPlaceholder("https://public-operation-nap-sg.hoyoverse.com/...")
            .setStyle(TextInputStyle.Paragraph).setRequired(true).setMinLength(50).setMaxLength(4000),
        ),
      ),
    );
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

  if (
    customId === "settings_togglePainting" ||
    customId === "settings_toggleRankPainting" ||
    customId === "settings_toggleGachaPublic" ||
    customId === "settings_toggleGachaWeekly"
  ) {
    handleSettingsToggle(buttonInteraction, customId, tr);
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
  if (!interaction.isStringSelectMenu()) return;
  const selectInteraction = interaction as StringSelectMenuInteraction;
  const { locale, customId, values } = selectInteraction;
  const userLocale =
    (await getUserLang(selectInteraction.user.id)) ||
    toI18nLang(locale) ||
    "en";
  const tr = createTranslator(userLocale);

  if (!customId.startsWith("account"))
    await selectInteraction.deferUpdate().catch(() => {});
  if (customId.startsWith("news")) handleNews(selectInteraction, tr, values[0]);
  if (customId.startsWith("account"))
    handleAccountAction(selectInteraction, tr, customId, values[0]);
  if (customId.startsWith("profile_SelectCharacter"))
    handleSelectCharacter(selectInteraction, tr, values, userLocale);
  if (customId === "settings_selectLocale")
    handleSettingsLocale(selectInteraction, values[0], tr);
  if (customId === "settings_selectProfileStyle")
    handleSettingsProfileStyle(selectInteraction, values[0], tr);
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
      const zzz = await getUserZZZData(interaction as any, tr, ownerId!, locale, accountIndex);
      if (!zzz) return;
      const { createSignalLogSession, buildSignalLogMessage } = await import("../utilities/zzz/signalLogView.js");
      const session = await createSignalLogSession({
        interaction: interaction as any, ownerId: ownerId!, accountIndex, source, zzz,
        uid: String(zzz.uid), playerName: (zzz as any).nickname,
        linked: true, region: (zzz as any).region,
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

  // Rebuild the settings message with updated values
  const { buildSettingsComponents } =
    await import("../commands/slash/settings.js");
  // tr may reflect old locale; re-derive from DB to be safe
  const userLocale = (await getUserLang(userId)) || "en";
  const newTr = createTranslator(userLocale);
  const { container } = await buildSettingsComponents(userId, newTr);

  await interaction.editReply({
    flags: MessageFlags.IsComponentsV2 as any,
    components: [container],
  });
}

async function handleGachaClearSelect(
  interaction: StringSelectMenuInteraction,
  value: string,
) {
  const split = value.lastIndexOf(":");
  const uid = value.slice(0, split);
  const source = value.slice(split + 1);
  if (!uid || !["official", "manual", "all"].includes(source)) return;
  const label = source === "official" ? "官方封存" : source === "manual" ? "手動匯入" : "全部紀錄";
  await interaction.followUp({
    flags: MessageFlags.Ephemeral,
    embeds: [new EmbedBuilder()
      .setColor("#E76161")
      .setTitle("確認永久清除調頻紀錄")
      .setDescription(`UID \`${uid}\` 的「${label}」會立即刪除，且無法復原。`)],
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
  const { getGachaArchiveStore } = await import("../utilities/zzz/gachaArchive.js");
  const source = rawSource === "all" ? undefined : rawSource as "official" | "manual";
  const removed = getGachaArchiveStore().clear(interaction.user.id, uid, source);
  await interaction.editReply({
    content: removed ? `已永久清除 UID \`${uid}\` 的調頻封存。` : "找不到可清除的封存。",
    embeds: [],
    components: [],
  });
}

async function handleSettingsArchivePage(
  interaction: ButtonInteraction,
  customId: string,
) {
  const page = Math.max(0, Number(customId.split(":")[1]) || 0);
  const locale = (await getUserLang(interaction.user.id)) || "en";
  const { buildSettingsComponents } = await import("../commands/slash/settings.js");
  const { container } = await buildSettingsComponents(
    interaction.user.id,
    createTranslator(locale),
    undefined,
    page,
  );
  await interaction.editReply({
    flags: MessageFlags.IsComponentsV2 as any,
    components: [container],
  });
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

  const newTr = createTranslator(locale);
  const { buildSettingsComponents } =
    await import("../commands/slash/settings.js");
  const { container } = await buildSettingsComponents(userId, newTr);

  await interaction.editReply({
    flags: MessageFlags.IsComponentsV2 as any,
    components: [container],
  });
}

async function handleSettingsProfileStyle(
  interaction: StringSelectMenuInteraction,
  rawStyle: string,
  _tr: any,
) {
  const userId = interaction.user.id;
  const profileStyle = normalizeZzzProfileStyle(rawStyle);
  await client.db.set(`${userId}.profileStyle`, profileStyle);

  const userLocale = (await getUserLang(userId)) || "en";
  const newTr = createTranslator(userLocale);
  const { buildSettingsComponents } =
    await import("../commands/slash/settings.js");
  const { container } = await buildSettingsComponents(userId, newTr);

  await interaction.editReply({
    flags: MessageFlags.IsComponentsV2 as any,
    components: [container],
  });
}

async function handleProfileMainPage(
  interaction: ButtonInteraction,
  tr: any,
  userLocale: string,
) {
  try {
    const [, , userId, accountIndexRaw] = interaction.customId.split("-");
    const accountIndex = parseInt(accountIndexRaw || "0");
    const zzz = await getUserZZZData(
      interaction as any,
      tr,
      userId,
      userLocale,
      accountIndex,
    );
    if (!zzz) return;

    const [record, characters, userData] = await Promise.all([
      zzz.record.records(),
      zzz.record.characters(),
      getUserHoyolabData(interaction as any, tr, userId),
    ]);

    const imageBuffer = await drawMainImage(
      tr,
      userLocale,
      userData,
      record,
      characters,
    );
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
        const record = await zzz.record.records();
        const userData = await getUserHoyolabData(
          interaction as any,
          tr,
          userId,
        );
        imageBuffer = await drawMainImage(
          tr,
          userLocale,
          userData,
          record,
          characters,
        );
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
