import { randomUUID } from "node:crypto";
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type StringSelectMenuInteraction,
  type ModalSubmitInteraction,
} from "discord.js";
import { importLiveTeam, type LiveBuild } from "./liveBuild.js";
import {
  calculateLiveRotation,
  DEFAULT_DAMAGE_CONDITIONS,
  parseCalculationTarget,
  parseDamageConditions,
  referenceAttacks,
  type CalculationEntry,
  type CalculationTarget,
  type DamageConditions,
} from "./liveCalculator.js";
import { formatDamage, renderLiveDamageCard } from "./liveDamageRender.js";
import { finite, integer } from "./stats.js";

export interface LiveDamageSession {
  id: string;
  owner: string;
  revision: number;
  expires: number;
  team: LiveBuild[];
  actor: string;
  attack: string;
  count: number;
  target: CalculationTarget;
  conditions: DamageConditions;
  entries: CalculationEntry[];
  totalView: boolean;
}
const sessions = new Map<string, LiveDamageSession>();
const busy = new Set<string>();
const TTL = 30 * 60_000;
const conditionLabels = {
  phase: "蕾米埃爾 · 相變時流",
  signatureActive: "空羽復歸之詩 · 增益生效",
  phantom: "蕾米埃爾 · 幻色／二影防禦忽視",
  remielleDisc: "讖羽之誓 · 精通增益",
  fangedMetal: "獠牙重金屬 · 強擊後增傷",
  chaosJazz: "混沌爵士 · 後場／餘效",
} as const;

/** Creation is separate from presentation so previews use the exact bot message payload. */
export function createLiveDamageSession(
  owner: string,
  characters: unknown,
): LiveDamageSession {
  const now = Date.now();
  for (const [id, state] of sessions)
    if (state.expires <= now) sessions.delete(id);
  if (sessions.size >= 1000)
    throw new Error("目前試算工作階段已滿，請稍後再試。");
  const team = importLiveTeam(characters);
  team.forEach((a) => referenceAttacks(a));
  const actor = team.find((a) => a.id === "1171") ?? team[0];
  const state: LiveDamageSession = {
    id: randomUUID().slice(0, 18),
    owner,
    revision: 1,
    expires: now + TTL,
    team,
    actor: actor.id,
    attack: actor.id === "1171" ? "afterburn" : referenceAttacks(actor)[0].id,
    count: 1,
    target: {
      defense: 953,
      resistance: 0,
      stunned: false,
      stunMultiplier: 1.5,
    },
    conditions: { ...DEFAULT_DAMAGE_CONDITIONS },
    entries: [],
    totalView: false,
  };
  sessions.set(state.id, state);
  return structuredClone(state);
}

export function liveDamageResult(state: LiveDamageSession) {
  return calculateLiveRotation(state.team, {
    target: state.target,
    conditions: state.conditions,
    entries:
      state.totalView && state.entries.length
        ? state.entries
        : [{ actor: state.actor, attack: state.attack, count: state.count }],
  });
}

export async function buildLiveDamageMessage(state: LiveDamageSession) {
  const result = liveDamageResult(state);
  const actor = state.team.find((a) => a.id === state.actor)!;
  const attacks = referenceAttacks(actor);
  const id = (action: string) =>
    `zcombat:live-${action}:${state.id}:${state.revision}`;
  const button = (
    action: string,
    label: string,
    style = ButtonStyle.Secondary,
  ) =>
    new ButtonBuilder().setCustomId(id(action)).setLabel(label).setStyle(style);
  const image = await renderLiveDamageCard(
    state.team,
    result,
    state.actor,
    state.totalView,
  );
  const embed = new EmbedBuilder()
    .setColor(0xffc568)
    .setTitle(
      state.totalView ? "隊伍傷害 · 手動項目合計" : "傷害試算 · 實際配裝",
    )
    .setDescription(
      state.totalView
        ? `已加入 **${state.entries.length} 項**，期望傷害合計 **${formatDamage(result.total)}**。每項保留加入時的增益，敵人設定共用。`
        : "選擇角色與招式即可更新圖片。設定敵人及增益後，可把項目加入隊伍合計。",
    )
    .setImage("attachment://zzz-damage.png")
    .setFooter({
      text: "逐項試算・資料範圍尚未涵蓋完整循環｜操作介面 30 分鐘未使用後失效",
    });
  return {
    embeds: [embed],
    files: [
      new AttachmentBuilder(image, {
        name: "zzz-damage.png",
        description: `${actor.name}傷害試算，期望傷害${formatDamage(result.total)}`,
      }),
    ],
    attachments: [],
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(id("actor"))
          .setPlaceholder("選擇角色")
          .addOptions(
            state.team.map((a) => ({
              label: a.name,
              value: a.id,
              description: `Lv.${a.level} · ${a.cinema} 影${a.awakening ? ` · 覺醒 ${a.awakening}` : ""}`,
              default: a.id === state.actor,
            })),
          ),
      ),
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(id("attack"))
          .setPlaceholder("選擇招式與倍率段")
          .addOptions(
            attacks.map((a) => ({
              label: a.name.slice(0, 100),
              value: a.id,
              description: `技能等級 ${a.level} · ${a.category === "anomaly" ? "異常傷害" : "此段傷害"}`,
              default: a.id === state.attack,
            })),
          ),
      ),
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(id("conditions"))
          .setPlaceholder("選擇生效中的增益（可複選）")
          .setMinValues(0)
          .setMaxValues(Object.keys(conditionLabels).length)
          .addOptions(
            Object.entries(conditionLabels).map(([key, label]) => ({
              label,
              value: key,
              default: Boolean(
                state.conditions[key as keyof typeof conditionLabels],
              ),
            })),
          ),
      ),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        button("target", "敵人設定"),
        button("counts", `次數 ${state.count} / 層數`),
        button(
          "stun",
          state.target.stunned ? "失衡：開" : "失衡：關",
          state.target.stunned ? ButtonStyle.Success : ButtonStyle.Secondary,
        ),
        button("add", "加入隊伍合計", ButtonStyle.Primary).setDisabled(
          state.entries.length >= 100,
        ),
      ),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        button(
          "view",
          state.totalView ? "返回單項" : `查看合計 (${state.entries.length})`,
        ).setDisabled(!state.entries.length),
        button("clear", "清空合計").setDisabled(!state.entries.length),
        button("export", "匯出計算明細"),
      ),
    ],
    allowedMentions: { parse: [] as never[] },
  };
}

type Interaction =
  ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction;
function settingsModal(state: LiveDamageSession, action: "target" | "counts") {
  const modal = new ModalBuilder()
    .setTitle(action === "target" ? "敵人設定" : "命中次數與增益層數")
    .setCustomId(`zcombat:live-${action}-submit:${state.id}:${state.revision}`);
  const fields =
    action === "target"
      ? [
          ["defense", "敵人防禦力（0～1000000）", state.target.defense],
          ["resistance", "全屬性抗性 %（-100～100）", state.target.resistance],
          [
            "stunMultiplier",
            "失衡易傷倍率（1～10）",
            state.target.stunMultiplier,
          ],
        ]
      : [
          ["count", "此傷害項目的命中次數（1～10000）", state.count],
          ["huntStacks", "淬鋒鉗刺層數（0～3）", state.conditions.huntStacks],
          [
            "compilerStacks",
            "嵌合編譯器層數（0～3）",
            state.conditions.compilerStacks,
          ],
        ];
  for (const [key, label, value] of fields)
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId(String(key))
          .setLabel(String(label))
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setValue(String(value))
          .setMaxLength(12),
      ),
    );
  return modal;
}

/** Called only after the shared combat release gate. No network or account credentials are needed. */
export async function handleLiveDamageInteraction(
  i: Interaction,
): Promise<void> {
  const [, fullAction, id, revision] = i.customId.split(":"),
    action = fullAction.slice(5);
  const state = sessions.get(id);
  const notice = async (content: string) => {
    if (i.deferred || i.replied)
      await i.followUp({
        content,
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
      });
    else
      await i.reply({
        content,
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
      });
  };
  if (
    !state ||
    state.owner !== i.user.id ||
    state.expires <= Date.now() ||
    String(state.revision) !== revision
  ) {
    await notice(
      "這個試算介面已更新或失效，請使用最新訊息，或重新開啟自己的隊伍試算。",
    );
    return;
  }
  if (busy.has(id)) {
    await notice("正在更新圖片，請稍候再操作。");
    return;
  }
  state.expires = Date.now() + TTL;
  if (i.isButton() && (action === "target" || action === "counts")) {
    await i.showModal(settingsModal(state, action));
    return;
  }
  if (i.isButton() && action === "export") {
    await i.reply({
      files: [
        new AttachmentBuilder(
          Buffer.from(
            JSON.stringify(
              {
                team: state.team,
                entries: state.totalView
                  ? state.entries
                  : [
                      {
                        actor: state.actor,
                        attack: state.attack,
                        count: state.count,
                      },
                    ],
                result: liveDamageResult(state),
              },
              null,
              2,
            ),
          ),
          { name: "zzz-damage-details.json" },
        ),
      ],
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
    return;
  }
  busy.add(id);
  try {
    const next = structuredClone(state);
    if (i.isStringSelectMenu() && action === "actor") {
      const actor = next.team.find((a) => a.id === i.values[0]);
      if (!actor) throw new Error("請選擇隊伍中的角色。");
      next.actor = actor.id;
      next.attack =
        actor.id === "1171" ? "afterburn" : referenceAttacks(actor)[0].id;
      next.totalView = false;
    } else if (i.isStringSelectMenu() && action === "attack") {
      if (
        !referenceAttacks(next.team.find((a) => a.id === next.actor)!).some(
          (a) => a.id === i.values[0],
        )
      )
        throw new Error("此招式尚未支援。");
      next.attack = i.values[0];
      next.totalView = false;
    } else if (i.isStringSelectMenu() && action === "conditions") {
      if (i.values.some((key) => !Object.hasOwn(conditionLabels, key)))
        throw new Error("無效的增益選項。");
      next.conditions = parseDamageConditions({
        ...next.conditions,
        ...Object.fromEntries(
          Object.keys(conditionLabels).map((key) => [
            key,
            i.values.includes(key),
          ]),
        ),
      });
      next.totalView = false;
    } else if (i.isModalSubmit() && action === "target-submit") {
      const value = (key: string) =>
        finite(i.fields.getTextInputValue(key), key, -1e6, 1e6);
      next.target = parseCalculationTarget({
        ...next.target,
        defense: value("defense"),
        resistance: value("resistance"),
        stunMultiplier: value("stunMultiplier"),
      });
    } else if (i.isModalSubmit() && action === "counts-submit") {
      next.count = integer(
        i.fields.getTextInputValue("count"),
        "命中次數",
        1,
        10000,
      );
      next.conditions = parseDamageConditions({
        ...next.conditions,
        huntStacks: integer(
          i.fields.getTextInputValue("huntStacks"),
          "淬鋒鉗刺層數",
          0,
          3,
        ),
        compilerStacks: integer(
          i.fields.getTextInputValue("compilerStacks"),
          "嵌合編譯器層數",
          0,
          3,
        ),
      });
      next.totalView = false;
    } else if (i.isButton() && action === "stun")
      next.target.stunned = !next.target.stunned;
    else if (i.isButton() && action === "add") {
      if (next.entries.length >= 100)
        throw new Error("最多可加入 100 個傷害項目。");
      next.entries.push({
        actor: next.actor,
        attack: next.attack,
        count: next.count,
        conditions: { ...next.conditions },
      });
    } else if (i.isButton() && action === "view")
      next.totalView = !next.totalView && next.entries.length > 0;
    else if (i.isButton() && action === "clear") {
      next.entries = [];
      next.totalView = false;
    } else throw new Error("不支援的試算操作。");
    // Modal submissions must originate from this component message to replace its attachment.
    if (i.isModalSubmit() && !i.isFromMessage())
      throw new Error("請重新從試算訊息開啟設定。");
    await i.deferUpdate();
    next.revision++;
    next.expires = Date.now() + TTL;
    const payload = await buildLiveDamageMessage(next);
    await i.editReply(payload);
    sessions.set(id, next);
  } catch (error) {
    await notice(
      error instanceof Error
        ? `無法更新試算：${error.message}`
        : "無法更新試算，請稍後再試。",
    );
  } finally {
    busy.delete(id);
  }
}
