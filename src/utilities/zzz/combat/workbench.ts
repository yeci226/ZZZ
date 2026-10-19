import { randomUUID } from "node:crypto";
import { gzipSync } from "node:zlib";
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  FileUploadBuilder,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type StringSelectMenuInteraction,
  type ModalSubmitInteraction,
} from "discord.js";
import { combatText } from "./copy.js";
import { combatReleased } from "./release.js";
import {
  combatCatalog,
  combatDefaults,
  importBuildSpec,
  type BuildSpec,
} from "./catalog.js";
import { scoreCharacter, type ScoringSnapshot } from "./scoring.js";
import { getScoringStore } from "./scoringStore.js";
import { defaultRotation, exportRotation, importRotation } from "./rotation.js";
import { combatJobs } from "./jobs.js";
import { CombatPlans, type PlanDB } from "./plans.js";
import {
  renderCombatResult,
  exportCombatResult,
  exportCombatCsv,
} from "./combatReport.js";
import {
  buildLiveDamageMessage,
  createLiveDamageSession,
  handleLiveDamageInteraction,
} from "./liveDamageDiscord.js";
import { validateScenario } from "./validation.js";
import { importLiveBuild } from "./liveBuild.js";
import { compareImportedPanel } from "./damage.js";
import {
  compileDocument,
  exportDocument,
  importDocument,
  readPlanAttachment,
  validateDocument,
  type CombatDocument,
} from "./document.js";
import {
  ELEMENTS,
  MAIN_SLOTS,
  MAIN_MAX,
  SUB_ROLL,
  finite,
  integer,
  type Stat,
  type Element,
} from "./stats.js";
import {
  editorText,
  simulationText,
  equipmentStatLabel,
} from "./editorCopy.js";
import {
  newRotationSelection,
  rotationComponents,
  rotationModal,
  stepLabel,
  type RotationSelection,
} from "./rotationPanel.js";
import {
  editRotation,
  repeatStep,
  stepCondition,
  type RotationEdit,
} from "./rotationEditor.js";
import { compareDamage, damageSummary } from "./results.js";
import type {
  EnemyModel,
  RotationStep,
  SimulationResult,
  SimulationScenario,
} from "./types.js";

type Page =
  | "score"
  | "equipment"
  | "weapons"
  | "discs"
  | "target"
  | "initial"
  | "rotation"
  | "results";
interface Session {
  id: string;
  owner: string;
  locale: string;
  expires: number;
  revision: number;
  page: Page;
  selected: number;
  weaponPage?: number;
  discSlot?: number;
  discSub?: number;
  characters: Record<string, any>[];
  builds: string[];
  weights: ScoringSnapshot;
  specs?: BuildSpec[];
  enemy?: EnemyModel;
  customEnemy?: EnemyModel;
  enemyPreset?: string;
  choosingEnemy?: boolean;
  enemyPresetPage?: number;
  rotation?: RotationStep[];
  bangboo?: BuildSpec;
  incoming?: SimulationScenario["incoming"];
  baseline?: BuildSpec[];
  promotions?: Record<number, { agent: number; weapon?: number }>;
  loop: boolean;
  switchMs?: number;
  rotationSelection: RotationSelection;
  result?: { scenario: SimulationScenario; result: SimulationResult };
  durationMs: number;
  mode: "fixed-duration" | "kill";
  initialState?: SimulationScenario["initialState"];
  initialResource?: string;
  initialSelected?: number;
  reportPage: "summary" | "actions" | "timeline";
  gameDataVersion?: string;
  rotationVersion?: string;
  seed: number;
  trials: number;
  lastPlan?: string;
}
const sessions = new Map<string, Session>();
const running = new Map<string, { cancelled: boolean }>();
const TTL = 30 * 60_000;
/** Runtime defaults stay absent until sourced target/timing models pass release review. */
export function isCombatInteraction(id: string): boolean {
  return id.startsWith("zcombat:");
}

export function buildCombatEntry(
  owner: string,
  locale: string,
  characters: Record<string, any>[],
): ActionRowBuilder<ButtonBuilder>[] {
  if (!combatReleased() || !characters.length) return [];
  const now = Date.now();
  for (const [id, session] of sessions)
    if (session.expires < now) sessions.delete(id);
  if (sessions.size >= 1000) return [];
  const session: Session = {
    id: randomUUID().slice(0, 18),
    owner,
    locale,
    expires: now + TTL,
    revision: 1,
    page: "score",
    selected: 0,
    characters: structuredClone(characters),
    builds: characters.map(() => "auto"),
    weights: getScoringStore().snapshot(),
    durationMs: 90_000,
    mode: "fixed-duration",
    reportPage: "summary",
    seed: 12345,
    trials: 100,
    loop: true,
    rotationSelection: newRotationSelection(),
  };
  sessions.set(session.id, session);
  const t = combatText(locale);
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`zcombat:open:${session.id}`)
        .setLabel(t.score)
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`zcombat:simulate:${session.id}`)
        .setLabel(t.simulation)
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`zcombat:reference:${session.id}`)
        .setLabel("逐項傷害試算")
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
}
function compiled(session: Session): SimulationScenario {
  const baseline = sourceSpecs(session);
  for (const [index, raw] of session.characters.entries()) {
    // Portable plans and minimal synthetic fixtures have no official display.
    // Cross-check the original build before team buffs, never hypothetical gear.
    if (!Object.hasOwn(raw, "properties")) continue;
    const imported = importLiveBuild(raw);
    const reconstructed = combatCatalog.compile(baseline[index]);
    const shown = Object.fromEntries(
      (
        [
          "hp",
          "atk",
          "def",
          "impact",
          "critRate",
          "critDmg",
          "anomalyMastery",
          "anomalyProficiency",
          "penRatio",
          "energyRegen",
        ] as const
      ).map((stat) => [stat, imported.displayed[stat]]),
    );
    if (
      raw.properties.some(
        (property: { property_id: number }) =>
          Number(property.property_id) === 232,
      )
    )
      shown.penFlat = imported.displayed.penFlat;
    const mismatches = compareImportedPanel(reconstructed.panel, shown);
    if (mismatches.length)
      throw new Error(
        `${imported.name} · Imported panel mismatch: ${mismatches
          .map((stat) => {
            const key = stat as keyof typeof reconstructed.panel;
            return `${stat} (model ${reconstructed.panel[key]}, official ${imported.displayed[key]})`;
          })
          .join(", ")}`,
      );
  }
  const specs = session.specs ?? baseline;
  const formation = combatCatalog.compileFormation(specs, session.bangboo),
    team = formation.team;
  const enemy = session.enemy ?? combatDefaults.enemy;
  const switchMs = session.switchMs ?? combatDefaults.switchMs;
  if (!enemy || switchMs === undefined)
    throw new Error(combatText(session.locale).unverified);
  return validateScenario({
    schemaVersion: 1,
    modelVersion: combatCatalog.version,
    mode: session.mode,
    ...(session.initialState ? { initialState: session.initialState } : {}),
    ...(session.gameDataVersion
      ? { gameDataVersion: session.gameDataVersion }
      : {}),
    ...(session.rotationVersion
      ? { rotationVersion: session.rotationVersion }
      : {}),
    durationMs: session.durationMs,
    ...formation,
    enemy,
    rotation: session.rotation ?? defaultRotation(team),
    switchMs,
    loop: session.loop,
    incoming: session.incoming ?? [],
    seed: session.seed,
    trials: session.trials,
  });
}
function sourceSpecs(s: Session): BuildSpec[] {
  return (
    s.baseline ??
    s.characters.map((c, index) => importBuildSpec(c, s.promotions?.[index]))
  );
}
function document(s: Session): CombatDocument {
  const scenario = compiled(s);
  return validateDocument(
    {
      schemaVersion: 3,
      mode: s.mode,
      initialState: s.initialState,
      gameDataVersion: s.gameDataVersion,
      rotationVersion: s.rotationVersion,
      modelVersion: combatCatalog.version,
      name: s.characters
        .map((c) => c.name_mi18n ?? c.name ?? c.id)
        .join(" / ")
        .slice(0, 100),
      baseline: sourceSpecs(s),
      specs: s.specs ?? sourceSpecs(s),
      bangboo: s.bangboo,
      enemy: scenario.enemy,
      rotation: scenario.rotation,
      incoming: scenario.incoming,
      durationMs: scenario.durationMs,
      switchMs: scenario.switchMs,
      loop: scenario.loop,
      seed: scenario.seed,
      trials: scenario.trials,
    },
    combatCatalog,
  );
}
function restoreDocument(s: Session, doc: CombatDocument): void {
  const validated = validateDocument(doc, combatCatalog),
    scenario = compileDocument(validated, combatCatalog);
  Object.assign(s, {
    mode: validated.mode,
    initialState: validated.initialState,
    initialResource: undefined,
    gameDataVersion: validated.gameDataVersion,
    rotationVersion: validated.rotationVersion,
    reportPage: "summary",
    weaponPage: 0,
    discSlot: 1,
    discSub: 0,
    baseline: validated.baseline,
    specs: validated.specs,
    bangboo: validated.bangboo,
    enemy: validated.enemy,
    customEnemy: validated.enemy,
    enemyPreset: undefined,
    choosingEnemy: false,
    enemyPresetPage: 0,
    rotation: validated.rotation,
    incoming: validated.incoming,
    durationMs: validated.durationMs,
    switchMs: validated.switchMs,
    loop: validated.loop,
    seed: validated.seed,
    trials: validated.trials,
    selected: 0,
    page: "equipment",
    result: undefined,
    characters: scenario.team.map((a) => ({ id: a.id, name_mi18n: a.name })),
    builds: scenario.team.map(() => "auto"),
    rotationSelection: newRotationSelection(),
  });
}
function verifiedEnemyPresets(): string[] {
  return combatCatalog.supportedEnemies().filter((id) => {
    try {
      combatCatalog.enemy(id);
      combatCatalog.enemySources(id);
      return true;
    } catch {
      return false;
    }
  });
}
function pageLabel(page: Page, locale: string): string {
  const x = simulationText(locale);
  if (page === "initial") return x.initial;
  if (page === "weapons") return x.weaponPicker;
  if (page === "discs") return x.discs;
  return combatText(locale)[page];
}
function mainStatChoices(slot: number, locale: string) {
  return MAIN_SLOTS[slot].flatMap((stat) =>
    stat === "Element_DMG"
      ? ELEMENTS.map((element) => ({
          label: equipmentStatLabel(locale, stat, element),
          value: `${stat}:${element}`,
        }))
      : [{ label: equipmentStatLabel(locale, stat), value: stat }],
  );
}
function mainStatChoice(stat: Stat, element?: Element) {
  return stat === "Element_DMG" ? `${stat}:${element}` : stat;
}
function weaponLabel(s: Session, id: string): string {
  const imported = s.characters.find(
    (c) => String(c.weapon?.id) === id,
  )?.weapon;
  return String(imported?.name ?? id).slice(0, 100);
}
function panel(s: Session) {
  const t = combatText(s.locale),
    e = editorText(s.locale),
    x = simulationText(s.locale),
    character = s.characters[s.selected];
  let score: ReturnType<typeof scoreCharacter> = null;
  if (Array.isArray(character.equip))
    score = scoreCharacter(character, s.weights, s.builds[s.selected]);
  const embed = new EmbedBuilder()
    .setTitle(
      `${t.simulation} · ${character.name_mi18n ?? character.name ?? character.id}`,
    )
    .setColor(0xf2a350);
  if (s.page === "score") {
    embed.setDescription(
      score
        ? `${t.build}: ${score.build}\n${t.total}: ${score.total?.toFixed(1) ?? t.invalid}/600 · ${score.grade ?? "—"}`
        : t.pending,
    );
    if (score)
      for (const d of score.discs)
        embed.addFields({
          name: String(d.slot),
          value:
            d.status === "scored"
              ? `${d.score!.toFixed(1)} · ${d.grade}`
              : d.status === "empty"
                ? t.empty
                : t.invalid,
          inline: true,
        });
    embed.setFooter({
      text: `${score?.version ?? ""} · ${s.weights.hash.slice(0, 10)}`,
    });
  } else {
    embed.setDescription(
      `${pageLabel(s.page, s.locale)} · ${s.mode === "kill" ? x.kill : x.fixed}\n${s.durationMs / 1000}s · n=${s.trials} · seed=${s.seed}`,
    );
    if (s.page === "equipment")
      embed.addFields(
        {
          name: t.current,
          value: s.characters
            .map((c) => c.name_mi18n ?? c.name ?? String(c.id))
            .join(" / "),
        },
        { name: t.hypothetical, value: s.specs ? "✓" : "—" },
      );
    if (s.page === "equipment" && s.specs) {
      const choice = s.specs[s.selected];
      embed.addFields({
        name: x.actorSettings,
        value: `${x.actorLevel}: ${choice.level} · ${e.promotion}: ${choice.promotion}\n${x.cinema}: ${choice.cinema} · ${x.awakening}: ${choice.awakening ?? 0}`,
      });
      embed.addFields({
        name: x.skillSettings,
        value:
          Object.entries(choice.skills)
            .map(([skill, level]) => `${skill}: ${level}`)
            .join(" · ")
            .slice(0, 1024) || "—",
      });
      if (choice.weapon)
        embed.addFields({
          name: x.weaponSettings,
          value: `${choice.weapon.id} · Lv.${choice.weapon.level} · ${e.weaponPromotion}: ${choice.weapon.promotion} · R${choice.weapon.refinement}`,
        });
    }
    if (s.page === "equipment")
      embed.addFields({
        name: "邦布 / Bangboo",
        value: s.bangboo?.id ?? x.noBangboo,
      });
    if (s.page === "weapons") {
      const choice = (s.specs ?? sourceSpecs(s))[s.selected];
      embed.addFields({
        name: x.weaponPicker,
        value: choice.weapon
          ? `${weaponLabel(s, choice.weapon.id)} · Lv.${choice.weapon.level} · R${choice.weapon.refinement}`
          : t.empty,
      });
      if (!combatCatalog.supportedEquipment().weapons.length)
        embed.addFields({ name: t.validation, value: x.noWeaponModels });
    }
    if (s.page === "discs") {
      const choice = (s.specs ?? sourceSpecs(s))[s.selected];
      const item = choice.discs.find((d) => d.disc.slot === (s.discSlot ?? 1));
      if (!combatCatalog.supportedEquipment().sets.length)
        embed.addFields({ name: t.validation, value: x.noSetModels });
      else if (
        item &&
        !combatCatalog.supportedEquipment().sets.includes(item.setId)
      )
        embed.addFields({ name: t.validation, value: x.unsupportedSet });
      if (!item) embed.addFields({ name: x.discs, value: x.emptyDisc });
      else {
        embed.addFields({
          name: `${x.slot} ${item.disc.slot} · ${item.setId}`,
          value: `${item.disc.rarity} · Lv.${item.disc.level}\n${equipmentStatLabel(s.locale, item.disc.main.stat, item.disc.main.element)}: ${item.disc.main.value}`,
        });
        embed.addFields({
          name: x.subStat,
          value:
            item.disc.subs
              .map(
                (stat, index) =>
                  `${index + 1}. ${equipmentStatLabel(s.locale, stat.stat)}: ${stat.value}`,
              )
              .join("\n") || "—",
        });
      }
    }
    if (s.page === "target") {
      const enemy = s.enemy ?? combatDefaults.enemy;
      if (enemy)
        embed.addFields({
          name: x.targetSource,
          value: s.enemyPreset
            ? `${s.enemyPreset} · ${combatCatalog.version}\n${combatCatalog.enemySources(s.enemyPreset).join("\n")}`.slice(
                0,
                1024,
              )
            : s.enemy
              ? x.customTarget
              : x.defaultTarget,
        });
      if (enemy)
        embed.addFields(
          {
            name: x.customTarget,
            value: `Lv.${enemy.level} · DEF ${enemy.defense} · HP ${enemy.hp ?? "—"}`,
          },
          {
            name: x.resistance,
            value: ELEMENTS.map((el) => `${el}: ${enemy.resistance[el]}%`).join(
              " · ",
            ),
          },
          {
            name: x.stun,
            value: `${enemy.stunThreshold} · ${enemy.stunDurationMs / 1000}s · ×${enemy.stunMultiplier}`,
          },
        );
    }
    if (s.page === "initial") {
      const formation = combatCatalog.compileFormation(
        s.specs ?? sourceSpecs(s),
        s.bangboo,
      );
      const actors = [
        ...formation.team,
        ...(formation.bangboo ? [formation.bangboo] : []),
      ];
      embed.addFields({
        name: x.initialActor,
        value:
          formation.team.find((a) => a.id === s.initialState?.activeActor)
            ?.name ?? formation.team[0].name,
      });
      for (const actor of actors)
        embed.addFields({
          name: actor.name,
          value:
            Object.entries(actor.resources)
              .map(
                ([name, r]) =>
                  `${name}: ${s.initialState?.resources[actor.id]?.[name] ?? r.initial} / ${r.max}`,
              )
              .join("\n") || x.emptyResources,
          inline: true,
        });
    }
    if (s.page === "rotation") {
      const scenario = compiled(s),
        start = Math.floor(s.rotationSelection.step / 20) * 20;
      embed.addFields({
        name: t.rotation,
        value: scenario.rotation
          .slice(start, start + 20)
          .map(
            (step, index) =>
              `${start + index + 1}. ${stepLabel(step, scenario.team, s.locale)}`,
          )
          .join("\n")
          .slice(0, 1024),
      });
    }
    if (s.page === "results") {
      if (!s.result) embed.addFields({ name: t.results, value: e.noResults });
      else {
        const r = s.result.result;
        if (r.mode === "kill") {
          embed.addFields({
            name: x.killRate,
            value: `${((r.kill?.rate ?? 0) * 100).toFixed(1)}%`,
            inline: true,
          });
          embed.addFields({
            name: x.successTime,
            value:
              r.kill?.meanTimeMs == null
                ? x.timeout
                : `${(r.kill.meanTimeMs / 1000).toFixed(2)}s · P10 ${((r.kill.p10TimeMs ?? 0) / 1000).toFixed(2)}s / P90 ${((r.kill.p90TimeMs ?? 0) / 1000).toFixed(2)}s`,
          });
          embed.addFields({
            name: x.remainingHp,
            value: Math.round(r.kill?.meanRemainingHp ?? 0).toLocaleString(),
          });
        }
        embed.addFields({
          name: t.damage,
          value: `${Math.round(r.meanDamage).toLocaleString()}${r.mode === "kill" || r.meanDps === null ? "" : ` · ${r.meanDps.toFixed(1)} DPS`}\nP10 ${Math.round(r.p10).toLocaleString()} / P90 ${Math.round(r.p90).toLocaleString()}`,
        });
        for (const actor of damageSummary(r, s.result.scenario))
          embed.addFields({
            name: actor.name,
            value: `${Math.round(actor.damage).toLocaleString()} · ${(actor.share * 100).toFixed(1)}%\n${
              actor.actions
                .slice(0, 3)
                .map(
                  (a) => `${a.name}: ${Math.round(a.damage).toLocaleString()}`,
                )
                .join("\n") || "—"
            }`,
            inline: true,
          });
      }
    }
    if (s.lastPlan) embed.setFooter({ text: s.lastPlan });
  }
  const id = (action: string) => `zcombat:${action}:${s.id}:${s.revision}`;
  const pages: Page[] = [
    "score",
    "equipment",
    "weapons",
    "discs",
    "target",
    "initial",
    "rotation",
    "results",
  ];
  const rows: any[] = [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder().setCustomId(id("page")).addOptions(
        pages.map((p) => ({
          label: pageLabel(p, s.locale),
          value: p,
          default: s.page === p,
        })),
      ),
    ),
  ];
  if (s.page === "score") {
    rows.push(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder().setCustomId(id("actor")).addOptions(
          s.characters.map((c, i) => ({
            label: String(c.name_mi18n ?? c.name ?? c.id).slice(0, 100),
            value: String(i),
            default: s.selected === i,
          })),
        ),
      ),
    );
    if (score)
      rows.push(
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          new StringSelectMenuBuilder().setCustomId(id("build")).addOptions(
            ["auto", ...score.availableBuilds].map((b) => ({
              label: b === "auto" ? t.auto : b,
              value: b,
              default: s.builds[s.selected] === b,
            })),
          ),
        ),
      );
  } else if (s.page === "weapons" || s.page === "discs") {
    const choice = (s.specs ?? sourceSpecs(s))[s.selected];
    rows.push(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder().setCustomId(id("actor")).addOptions(
          s.characters.map((c, index) => ({
            label: String(c.name_mi18n ?? c.name ?? c.id).slice(0, 100),
            value: String(index),
            default: s.selected === index,
          })),
        ),
      ),
    );
    if (s.page === "weapons") {
      const weapons = combatCatalog.supportedEquipment().weapons;
      const page = Math.min(
        s.weaponPage ?? 0,
        Math.max(0, Math.ceil(weapons.length / 24) - 1),
      );
      rows.push(
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(id("weapon-choice"))
            .setPlaceholder(x.weaponPicker)
            .addOptions([
              { label: x.unequip, value: "__none__", default: !choice.weapon },
              ...weapons.slice(page * 24, page * 24 + 24).map((value) => ({
                label: weaponLabel(s, value),
                value,
                default: choice.weapon?.id === value,
              })),
            ]),
        ),
      );
      rows.push(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(id("weapon-prev"))
            .setLabel(e.previous)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(!page),
          new ButtonBuilder()
            .setCustomId(id("weapon-next"))
            .setLabel(e.next)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled((page + 1) * 24 >= weapons.length),
          new ButtonBuilder()
            .setCustomId(id("equipment-weapon"))
            .setLabel(x.weaponSettings)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(!choice.weapon),
          new ButtonBuilder()
            .setCustomId(id("gear-back"))
            .setLabel(e.back)
            .setStyle(ButtonStyle.Secondary),
        ),
      );
    } else {
      const slot = s.discSlot ?? 1;
      const item = choice.discs.find((d) => d.disc.slot === slot);
      rows.push(
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(id("disc-slot"))
            .setPlaceholder(x.slot)
            .addOptions(
              [1, 2, 3, 4, 5, 6].map((value) => ({
                label: `${x.slot} ${value}${choice.discs.some((d) => d.disc.slot === value) ? "" : ` · ${t.empty}`}`,
                value: String(value),
                default: value === slot,
              })),
            ),
        ),
      );
      if (item)
        rows.push(
          new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId(id("disc-sub-index"))
              .setPlaceholder(x.subStat)
              .addOptions(
                [0, 1, 2, 3].map((index) => ({
                  label: `${index + 1}. ${item.disc.subs[index] ? `${equipmentStatLabel(s.locale, item.disc.subs[index].stat)} ${item.disc.subs[index].value}` : x.newSub}`,
                  value: String(index),
                  default: (s.discSub ?? 0) === index,
                })),
              ),
          ),
        );
      rows.push(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(id("disc-main"))
            .setLabel(x.mainStat)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(!item),
          new ButtonBuilder()
            .setCustomId(id("disc-sub"))
            .setLabel(x.subStat)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(!item),
          new ButtonBuilder()
            .setCustomId(id("disc-level"))
            .setLabel(x.discLevel)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(!item),
          new ButtonBuilder()
            .setCustomId(id("gear-back"))
            .setLabel(e.back)
            .setStyle(ButtonStyle.Secondary),
        ),
      );
    }
  } else if (s.page === "initial") {
    const formation = combatCatalog.compileFormation(
      s.specs ?? sourceSpecs(s),
      s.bangboo,
    );
    const actors = [
      ...formation.team,
      ...(formation.bangboo ? [formation.bangboo] : []),
    ];
    const actor = actors[s.initialSelected ?? 0] ?? actors[0];
    const resources = Object.keys(actor.resources);
    rows.push(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(id("initial-actor"))
          .setPlaceholder(e.selectActor)
          .addOptions(
            actors.map((a, index) => ({
              label: a.name.slice(0, 100),
              value: String(index),
              default: a.id === actor.id,
            })),
          ),
      ),
    );
    if (resources.length)
      rows.push(
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(id("initial-resource"))
            .setPlaceholder(x.resource)
            .addOptions(
              resources.slice(0, 25).map((name) => ({
                label: name,
                value: name,
                default: name === (s.initialResource ?? resources[0]),
              })),
            ),
        ),
      );
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(id("initial-edit"))
          .setLabel(x.resource)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(!resources.length),
        new ButtonBuilder()
          .setCustomId(id("initial-active"))
          .setLabel(x.active)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(actor.kind !== "agent"),
        new ButtonBuilder()
          .setCustomId(id("initial-reset"))
          .setLabel(x.reset)
          .setStyle(ButtonStyle.Secondary),
      ),
    );
  } else if (s.page === "rotation") {
    const scenario = compiled(s);
    rows.push(
      ...rotationComponents(
        scenario.rotation,
        scenario.team,
        s.rotationSelection,
        s.locale,
        id,
      ),
    );
  } else {
    if (s.page === "target" && s.choosingEnemy) {
      const presets = verifiedEnemyPresets();
      const page = Math.min(
        s.enemyPresetPage ?? 0,
        Math.max(0, Math.ceil(presets.length / 24) - 1),
      );
      const options = presets.slice(page * 24, page * 24 + 24).map((value) => ({
        label: value.slice(0, 100),
        value,
        default: value === s.enemyPreset,
      }));
      if (s.customEnemy ?? s.enemy ?? combatDefaults.enemy)
        options.unshift({
          label: x.customTarget,
          value: "__custom__",
          default: !s.enemyPreset,
        });
      if (!options.length) throw new Error(t.unverified);
      rows.push(
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(id("enemy-preset"))
            .setPlaceholder(x.targetPreset)
            .addOptions(options),
        ),
      );
    } else if (s.page === "target" || s.page === "results")
      rows.push(
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(id(s.page === "target" ? "mode" : "report-page"))
            .addOptions(
              s.page === "target"
                ? [
                    {
                      label: x.fixed,
                      value: "fixed-duration",
                      default: s.mode === "fixed-duration",
                    },
                    {
                      label: x.kill,
                      value: "kill",
                      default: s.mode === "kill",
                    },
                  ]
                : ["summary", "actions", "timeline"].map((value) => ({
                    label: x[value as "summary"],
                    value,
                    default: s.reportPage === value,
                  })),
            ),
        ),
      );
    if (s.page === "equipment")
      rows.push(
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          new StringSelectMenuBuilder().setCustomId(id("actor")).addOptions(
            s.characters.map((c, index) => ({
              label: String(c.name_mi18n ?? c.name ?? c.id).slice(0, 100),
              value: String(index),
              default: s.selected === index,
            })),
          ),
        ),
      );
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...["edit", "run", "cancel", "save", "export"].map((action) =>
          new ButtonBuilder()
            .setCustomId(id(action))
            .setLabel(t[action as "edit"])
            .setStyle(
              action === "run" ? ButtonStyle.Primary : ButtonStyle.Secondary,
            ),
        ),
      ),
    );
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(id("import"))
          .setLabel(t.import)
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(id("restore"))
          .setLabel(`${t.save} ID`)
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(id("compare"))
          .setLabel(t.compare)
          .setStyle(ButtonStyle.Secondary),
      ),
    );
    if (s.page === "equipment")
      rows.push(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(id("promotion"))
            .setLabel(e.completeData)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(Boolean(s.baseline)),
          new ButtonBuilder()
            .setCustomId(id("equipment-agent"))
            .setLabel(x.actorSettings)
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId(id("equipment-skill"))
            .setLabel(x.skillSettings)
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId(id("weapon-open"))
            .setLabel(x.weaponPicker)
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId(id("disc-open"))
            .setLabel(x.discs)
            .setStyle(ButtonStyle.Secondary),
        ),
      );
    else if (s.page === "target" && s.choosingEnemy)
      rows.push(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(id("enemy-prev"))
            .setLabel(e.previous)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(!(s.enemyPresetPage ?? 0)),
          new ButtonBuilder()
            .setCustomId(id("enemy-next"))
            .setLabel(e.next)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(
              ((s.enemyPresetPage ?? 0) + 1) * 24 >=
                verifiedEnemyPresets().length,
            ),
          new ButtonBuilder()
            .setCustomId(id("enemy-back"))
            .setLabel(e.back)
            .setStyle(ButtonStyle.Secondary),
        ),
      );
    else
      rows.push(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(id("settings"))
            .setLabel(e.settings)
            .setStyle(ButtonStyle.Secondary),
          ...(s.page === "target"
            ? [
                new ButtonBuilder()
                  .setCustomId(id("target-basic"))
                  .setLabel(x.targetBasic)
                  .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                  .setCustomId(id("target-resistance"))
                  .setLabel(x.resistance)
                  .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                  .setCustomId(id("target-stun"))
                  .setLabel(x.stun)
                  .setStyle(ButtonStyle.Secondary),
                ...(verifiedEnemyPresets().length
                  ? [
                      new ButtonBuilder()
                        .setCustomId(id("enemy-pick"))
                        .setLabel(x.targetPreset)
                        .setStyle(ButtonStyle.Secondary),
                    ]
                  : []),
              ]
            : []),
          ...(s.page === "results"
            ? [
                new ButtonBuilder()
                  .setCustomId(id("download"))
                  .setLabel(x.download)
                  .setStyle(ButtonStyle.Secondary)
                  .setDisabled(!s.result),
              ]
            : []),
        ),
      );
  }
  return {
    embeds: [embed],
    components: rows,
    allowedMentions: { parse: [] as never[] },
  };
}

type WorkbenchInteraction =
  ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction;
const plansByDB = new WeakMap<object, CombatPlans>();
function getPlans(db: PlanDB) {
  let plans = plansByDB.get(db);
  if (!plans) {
    plans = new CombatPlans(db);
    plansByDB.set(db, plans);
  }
  return plans;
}
export async function handleCombatInteraction(
  i: WorkbenchInteraction,
  db: PlanDB,
): Promise<void> {
  const [, action, id, revision] = i.customId.split(":"),
    s = sessions.get(id);
  const t = combatText(s?.locale ?? i.locale);
  if (!combatReleased()) {
    await i.reply({ content: t.unverified, flags: MessageFlags.Ephemeral });
    return;
  }
  if (action.startsWith("live-")) {
    await handleLiveDamageInteraction(i);
    return;
  }
  if (
    !s ||
    s.owner !== i.user.id ||
    s.expires < Date.now() ||
    (revision !== undefined && Number(revision) !== s.revision)
  ) {
    await i.reply({ content: t.expired, flags: MessageFlags.Ephemeral });
    return;
  }
  s.expires = Date.now() + TTL;
  const expectedRevision = s.revision,
    e = editorText(s.locale);
  const commit = (next: Session, changed = true) => {
    if (
      sessions.get(id)?.revision !== expectedRevision ||
      sessions.get(id)?.expires! < Date.now()
    )
      throw new Error(t.expired);
    if (changed) next.result = undefined;
    next.revision = expectedRevision + 1;
    sessions.set(id, next);
  };
  try {
    const x = simulationText(s.locale);
    if (
      action === "gear-back" ||
      action === "weapon-open" ||
      action === "disc-open" ||
      action === "weapon-prev" ||
      action === "weapon-next" ||
      action === "disc-slot" ||
      action === "disc-sub-index"
    ) {
      const next = structuredClone(s);
      if (i.isButton() && action === "gear-back") next.page = "equipment";
      else if (i.isButton() && action === "weapon-open") {
        next.page = "weapons";
        next.weaponPage = 0;
      } else if (i.isButton() && action === "disc-open") {
        next.page = "discs";
        next.discSlot =
          (s.specs ?? sourceSpecs(s))[s.selected].discs[0]?.disc.slot ?? 1;
        next.discSub = 0;
      } else if (
        i.isButton() &&
        ["weapon-prev", "weapon-next"].includes(action)
      )
        next.weaponPage = integer(
          (s.weaponPage ?? 0) + (action === "weapon-next" ? 1 : -1),
          "weapon page",
          0,
          Math.max(
            0,
            Math.ceil(combatCatalog.supportedEquipment().weapons.length / 24) -
              1,
          ),
        );
      else if (i.isStringSelectMenu() && action === "disc-slot") {
        next.discSlot = integer(i.values[0], "disc slot", 1, 6);
        next.discSub = 0;
      } else if (i.isStringSelectMenu() && action === "disc-sub-index")
        next.discSub = integer(i.values[0], "substat index", 0, 3);
      else throw new Error("Unknown equipment navigation");
      panel(next);
      commit(next, false);
      await i.update(panel(next));
      return;
    }
    if (action === "weapon-choice" || action.startsWith("weapon-set_")) {
      if (
        (action === "weapon-choice" && !i.isStringSelectMenu()) ||
        (action.startsWith("weapon-set_") && !i.isModalSubmit())
      )
        throw new Error("Unknown W-Engine selection");
      const current = (s.specs ?? sourceSpecs(s))[s.selected];
      const weapons = combatCatalog.supportedEquipment().weapons;
      const choice = i.isStringSelectMenu()
        ? i.values[0]
        : action.slice("weapon-set_".length);
      if (choice !== "__none__" && !weapons.includes(choice))
        throw new Error(x.noWeaponModels);
      if (i.isStringSelectMenu() && choice !== "__none__") {
        const modal = new ModalBuilder()
          .setCustomId(`zcombat:weapon-set_${choice}:${id}:${s.revision}`)
          .setTitle(x.weaponPicker);
        for (const [key, label, value] of [
          ["level", x.weaponLevel, current.weapon?.level],
          ["promotion", e.weaponPromotion, current.weapon?.promotion],
          ["refinement", x.refinement, current.weapon?.refinement],
        ] as const)
          modal.addLabelComponents(
            new LabelBuilder().setLabel(label).setTextInputComponent(
              new TextInputBuilder()
                .setCustomId(key)
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(3)
                .setValue(value === undefined ? "" : String(value)),
            ),
          );
        await i.showModal(modal);
        return;
      }
      if (!i.isStringSelectMenu() && !i.isModalSubmit())
        throw new Error("Unknown W-Engine selection");
      const edited = structuredClone(current);
      edited.weapon =
        choice === "__none__"
          ? null
          : {
              id: choice,
              level: integer(
                (i as ModalSubmitInteraction).fields.getTextInputValue("level"),
                "weapon level",
                1,
                60,
              ),
              promotion: integer(
                (i as ModalSubmitInteraction).fields.getTextInputValue(
                  "promotion",
                ),
                "weapon promotion",
                0,
                6,
              ),
              refinement: integer(
                (i as ModalSubmitInteraction).fields.getTextInputValue(
                  "refinement",
                ),
                "refinement",
                1,
                5,
              ),
            };
      combatCatalog.compile(edited);
      const next = structuredClone(s);
      next.specs ??= structuredClone(sourceSpecs(next));
      next.specs[next.selected] = edited;
      compiled(next);
      commit(next);
      if (i.isModalSubmit())
        await i.reply({ ...panel(next), flags: MessageFlags.Ephemeral });
      else await i.update(panel(next));
      return;
    }
    if (
      [
        "disc-main",
        "disc-sub",
        "disc-level",
        "disc-main-submit",
        "disc-sub-submit",
        "disc-level-submit",
      ].includes(action)
    ) {
      const current = (s.specs ?? sourceSpecs(s))[s.selected];
      const item = current.discs.find((d) => d.disc.slot === (s.discSlot ?? 1));
      if (!item) throw new Error(x.emptyDisc);
      const sets = combatCatalog.supportedEquipment().sets;
      if (!sets.length) throw new Error(x.noSetModels);
      if (!sets.includes(item.setId)) throw new Error(x.unsupportedSet);
      const subIndex = s.discSub ?? 0;
      const sub = item.disc.subs[subIndex];
      const numeric = (
        key: string,
        label: string,
        value?: number,
        required = true,
      ) =>
        new LabelBuilder().setLabel(label).setTextInputComponent(
          new TextInputBuilder()
            .setCustomId(key)
            .setStyle(TextInputStyle.Short)
            .setRequired(required)
            .setMaxLength(14)
            .setValue(value === undefined ? "" : String(value)),
        );
      if (i.isButton()) {
        const modal = new ModalBuilder()
          .setCustomId(`zcombat:${action}-submit:${id}:${s.revision}`)
          .setTitle(`${x.discs} · ${item.disc.slot}`);
        if (action === "disc-level")
          modal.addLabelComponents(
            numeric("level", x.discLevel, item.disc.level),
          );
        else if (action === "disc-main")
          modal.addLabelComponents(
            new LabelBuilder()
              .setLabel(x.mainStat)
              .setStringSelectMenuComponent(
                new StringSelectMenuBuilder().setCustomId("stat").addOptions(
                  mainStatChoices(item.disc.slot, s.locale).map((option) => ({
                    ...option,
                    default:
                      option.value ===
                      mainStatChoice(
                        item.disc.main.stat,
                        item.disc.main.element,
                      ),
                  })),
                ),
              ),
            numeric("value", x.statValue, item.disc.main.value),
          );
        else
          modal.addLabelComponents(
            new LabelBuilder().setLabel(x.subStat).setStringSelectMenuComponent(
              new StringSelectMenuBuilder().setCustomId("stat").addOptions([
                ...(sub
                  ? [
                      {
                        label: x.removeSub,
                        value: "__remove__",
                        default: false,
                      },
                    ]
                  : []),
                ...Object.keys(SUB_ROLL).map((stat) => ({
                  label: equipmentStatLabel(s.locale, stat),
                  value: stat,
                  default: stat === sub?.stat,
                })),
              ]),
            ),
            numeric("value", x.statValue, sub?.value, false),
          );
        await i.showModal(modal);
        return;
      }
      if (!i.isModalSubmit()) throw new Error("Unknown drive-disc edit");
      const edited = structuredClone(current);
      const disc = edited.discs.find(
        (d) => d.disc.slot === item.disc.slot,
      )!.disc;
      let editedSub = subIndex;
      if (action === "disc-level-submit")
        disc.level = integer(
          i.fields.getTextInputValue("level"),
          "disc level",
          0,
          { S: 15, A: 12, B: 9 }[disc.rarity],
        );
      else if (action === "disc-main-submit") {
        const selected = i.fields.getStringSelectValues("stat")[0];
        if (
          !mainStatChoices(disc.slot, s.locale).some(
            (option) => option.value === selected,
          )
        )
          throw new Error("Main stat is not allowed in this slot");
        const [stat, element] = selected.split(":") as [
          Stat,
          Element | undefined,
        ];
        if (disc.subs.some((substat) => substat.stat === stat))
          throw new Error(x.duplicateStat);
        disc.main = {
          stat,
          value: finite(
            i.fields.getTextInputValue("value"),
            "main stat",
            0.001,
            MAIN_MAX[stat],
          ),
          ...(element ? { element } : {}),
        };
      } else {
        const stat = i.fields.getStringSelectValues("stat")[0];
        if (stat === "__remove__") {
          if (!sub) throw new Error("No substat in the selected position");
          disc.subs.splice(subIndex, 1);
          editedSub = Math.min(subIndex, disc.subs.length);
        } else {
          if (!Object.hasOwn(SUB_ROLL, stat))
            throw new Error("Unsupported substat");
          if (
            disc.main.stat === stat ||
            disc.subs.some(
              (substat, index) => index !== subIndex && substat.stat === stat,
            )
          )
            throw new Error(x.duplicateStat);
          const value = {
            stat: stat as Stat,
            value: finite(
              i.fields.getTextInputValue("value"),
              "substat",
              0.001,
              100_000,
            ),
          };
          if (sub) disc.subs[subIndex] = value;
          else {
            editedSub = disc.subs.length;
            disc.subs.push(value);
          }
        }
      }
      combatCatalog.compile(edited);
      const next = structuredClone(s);
      next.specs ??= structuredClone(sourceSpecs(next));
      next.specs[next.selected] = edited;
      next.discSub = editedSub;
      compiled(next);
      commit(next);
      await i.reply({ ...panel(next), flags: MessageFlags.Ephemeral });
      return;
    }
    if (action.startsWith("equipment-")) {
      const current = (s.specs ?? sourceSpecs(s))[s.selected];
      const input = (key: string, label: string, value: number) =>
        new LabelBuilder()
          .setLabel(label)
          .setTextInputComponent(
            new TextInputBuilder()
              .setCustomId(key)
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMaxLength(3)
              .setValue(String(value)),
          );
      if (i.isButton()) {
        const modal = new ModalBuilder()
          .setCustomId(`zcombat:${action}-submit:${id}:${s.revision}`)
          .setTitle(t.equipment);
        if (action === "equipment-agent")
          modal.addLabelComponents(
            input("level", x.actorLevel, current.level),
            input("promotion", e.promotion, current.promotion),
            input("cinema", x.cinema, current.cinema),
            input("awakening", x.awakening, current.awakening ?? 0),
          );
        else if (action === "equipment-skill") {
          const labels: Record<string, string> = {
            "0": x.basicSkill,
            basic: x.basicSkill,
            "1": x.specialSkill,
            "2": x.dodgeSkill,
            "3": x.chainSkill,
            "5": x.coreSkill,
            "6": x.assistSkill,
          };
          const skills = Object.entries(current.skills);
          if (!skills.length) throw new Error("No imported skills available");
          modal.addLabelComponents(
            new LabelBuilder().setLabel(x.skill).setStringSelectMenuComponent(
              new StringSelectMenuBuilder().setCustomId("skill").addOptions(
                skills.map(([key, level], index) => ({
                  label: `${labels[key] ?? key} · Lv.${level}`.slice(0, 100),
                  value: key,
                  default: index === 0,
                })),
              ),
            ),
            input("level", x.skillLevel, skills[0][1]),
          );
        } else if (action === "equipment-weapon") {
          if (!current.weapon) throw new Error("No W-Engine equipped");
          modal.addLabelComponents(
            input("level", x.weaponLevel, current.weapon.level),
            input("promotion", e.weaponPromotion, current.weapon.promotion),
            input("refinement", x.refinement, current.weapon.refinement),
          );
        } else throw new Error("Unknown equipment edit");
        await i.showModal(modal);
        return;
      }
      if (!i.isModalSubmit()) throw new Error("Unknown equipment edit");
      const edited = structuredClone(current);
      if (action === "equipment-agent-submit") {
        edited.level = integer(
          i.fields.getTextInputValue("level"),
          "level",
          1,
          60,
        );
        edited.promotion = integer(
          i.fields.getTextInputValue("promotion"),
          "promotion",
          0,
          6,
        );
        edited.cinema = integer(
          i.fields.getTextInputValue("cinema"),
          "cinema",
          0,
          6,
        );
        edited.awakening = integer(
          i.fields.getTextInputValue("awakening"),
          "awakening",
          0,
          6,
        );
      } else if (action === "equipment-skill-submit") {
        const skill = i.fields.getStringSelectValues("skill")[0];
        if (!Object.hasOwn(edited.skills, skill))
          throw new Error("Unknown imported skill");
        edited.skills[skill] = integer(
          i.fields.getTextInputValue("level"),
          "skill level",
          0,
          20,
        );
      } else if (action === "equipment-weapon-submit") {
        if (!edited.weapon) throw new Error("No W-Engine equipped");
        edited.weapon.level = integer(
          i.fields.getTextInputValue("level"),
          "weapon level",
          1,
          60,
        );
        edited.weapon.promotion = integer(
          i.fields.getTextInputValue("promotion"),
          "weapon promotion",
          0,
          6,
        );
        edited.weapon.refinement = integer(
          i.fields.getTextInputValue("refinement"),
          "refinement",
          1,
          5,
        );
      } else throw new Error("Unknown equipment edit");
      combatCatalog.compile(edited);
      const next = structuredClone(s);
      next.specs ??= structuredClone(sourceSpecs(next));
      next.specs[next.selected] = edited;
      compiled(next);
      commit(next);
      await i.reply({ ...panel(next), flags: MessageFlags.Ephemeral });
      return;
    }
    if (action.startsWith("initial-")) {
      const next = structuredClone(s);
      const formation = combatCatalog.compileFormation(
        s.specs ?? sourceSpecs(s),
        s.bangboo,
      );
      const actors = [
        ...formation.team,
        ...(formation.bangboo ? [formation.bangboo] : []),
      ];
      const actor = actors[s.initialSelected ?? 0] ?? actors[0];
      const resourceName = s.initialResource ?? Object.keys(actor.resources)[0];
      if (i.isButton() && action === "initial-edit") {
        const resource = actor.resources[resourceName];
        if (!resource) throw new Error(x.emptyResources);
        await i.showModal(
          new ModalBuilder()
            .setCustomId(`zcombat:initial-submit:${id}:${s.revision}`)
            .setTitle(x.resource)
            .addLabelComponents(
              new LabelBuilder()
                .setLabel(`${resourceName} · 0–${resource.max}`.slice(0, 45))
                .setTextInputComponent(
                  new TextInputBuilder()
                    .setCustomId("amount")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setMaxLength(20)
                    .setValue(
                      String(
                        s.initialState?.resources[actor.id]?.[resourceName] ??
                          resource.initial,
                      ),
                    ),
                ),
            ),
        );
        return;
      }
      if (i.isStringSelectMenu() && action === "initial-actor") {
        next.initialSelected = integer(
          i.values[0],
          "actor",
          0,
          actors.length - 1,
        );
        next.initialResource = undefined;
      } else if (i.isStringSelectMenu() && action === "initial-resource") {
        if (!Object.hasOwn(actor.resources, i.values[0]))
          throw new Error("Unknown resource");
        next.initialResource = i.values[0];
      } else if (i.isButton() && action === "initial-reset")
        next.initialState = undefined;
      else if (i.isButton() && action === "initial-active") {
        if (actor.kind !== "agent")
          throw new Error("Bangboo cannot be the active agent");
        next.initialState ??= {
          activeActor: formation.team[0].id,
          resources: {},
        };
        next.initialState.activeActor = actor.id;
      } else if (i.isModalSubmit() && action === "initial-submit") {
        const resource = actor.resources[resourceName];
        if (!resource) throw new Error("Unknown resource");
        next.initialState ??= {
          activeActor: formation.team[0].id,
          resources: {},
        };
        next.initialState.resources[actor.id] ??= {};
        next.initialState.resources[actor.id][resourceName] = finite(
          i.fields.getTextInputValue("amount"),
          "initial resource",
          0,
          resource.max,
        );
      } else throw new Error("Unknown initial state edit");
      commit(next, !i.isStringSelectMenu());
      if (i.isModalSubmit())
        await i.reply({ ...panel(next), flags: MessageFlags.Ephemeral });
      else await i.update(panel(next));
      return;
    }
    if (action.startsWith("enemy-")) {
      const presets = verifiedEnemyPresets();
      const next = structuredClone(s);
      let changed = false;
      if (i.isButton() && action === "enemy-pick") {
        next.choosingEnemy = true;
        next.enemyPresetPage = 0;
      } else if (i.isButton() && action === "enemy-back")
        next.choosingEnemy = false;
      else if (i.isButton() && ["enemy-prev", "enemy-next"].includes(action))
        next.enemyPresetPage = integer(
          (s.enemyPresetPage ?? 0) + (action === "enemy-next" ? 1 : -1),
          "enemy preset page",
          0,
          Math.max(0, Math.ceil(presets.length / 24) - 1),
        );
      else if (i.isStringSelectMenu() && action === "enemy-preset") {
        const choice = i.values[0];
        if (choice === "__custom__") {
          const custom =
            s.customEnemy ??
            (!s.enemyPreset ? s.enemy : undefined) ??
            combatDefaults.enemy;
          if (!custom) throw new Error(t.unverified);
          next.enemy = structuredClone(custom);
          next.enemyPreset = undefined;
        } else {
          if (!presets.includes(choice))
            throw new Error("Enemy preset is not verified");
          if (!s.enemyPreset)
            next.customEnemy = structuredClone(s.enemy ?? combatDefaults.enemy);
          next.enemy = combatCatalog.enemy(choice);
          next.enemyPreset = choice;
        }
        next.choosingEnemy = false;
        compiled(next);
        changed = true;
      } else throw new Error("Unknown enemy preset action");
      commit(next, changed);
      await i.update(panel(next));
      return;
    }
    if (action.startsWith("target-")) {
      const target = s.enemy ?? combatDefaults.enemy;
      if (!target) throw new Error(t.unverified);
      const input = (
        key: string,
        label: string,
        value?: number,
        required = true,
      ) =>
        new LabelBuilder().setLabel(label).setTextInputComponent(
          new TextInputBuilder()
            .setCustomId(key)
            .setStyle(TextInputStyle.Short)
            .setRequired(required)
            .setMaxLength(20)
            .setValue(value === undefined ? "" : String(value)),
        );
      if (i.isButton()) {
        const modal = new ModalBuilder()
          .setCustomId(`zcombat:${action}-submit:${id}:${s.revision}`)
          .setTitle(t.target);
        if (action === "target-basic")
          modal.addLabelComponents(
            input("level", x.level, target.level),
            input("defense", x.defense, target.defense),
            input("hp", x.hp, target.hp, s.mode === "kill"),
          );
        else if (action === "target-stun")
          modal.addLabelComponents(
            input("threshold", x.threshold, target.stunThreshold),
            input("seconds", x.stunSeconds, target.stunDurationMs / 1000),
            input("multiplier", x.multiplier, target.stunMultiplier),
          );
        else if (action === "target-resistance")
          modal.addLabelComponents(
            new LabelBuilder().setLabel(x.element).setStringSelectMenuComponent(
              new StringSelectMenuBuilder().setCustomId("element").addOptions(
                ELEMENTS.map((el) => ({
                  label: `${el} · ${target.resistance[el]}%`,
                  value: el,
                  default: el === "physical",
                })),
              ),
            ),
            input("resistance", x.resistancePercent),
          );
        else throw new Error("Unknown enemy edit");
        await i.showModal(modal);
        return;
      }
      if (!i.isModalSubmit()) throw new Error("Unknown enemy edit");
      const next = structuredClone(s);
      next.enemy = structuredClone(target);
      if (action === "target-basic-submit") {
        next.enemy.level = integer(
          i.fields.getTextInputValue("level"),
          "enemy level",
          1,
          100,
        );
        next.enemy.defense = finite(
          i.fields.getTextInputValue("defense"),
          "enemy defense",
          0,
          1_000_000,
        );
        const hp = i.fields.getTextInputValue("hp").trim();
        if (hp)
          next.enemy.hp = finite(hp, "enemy HP", 1, Number.MAX_SAFE_INTEGER);
        else if (s.mode === "kill") throw new Error(x.hp);
        else delete next.enemy.hp;
      } else if (action === "target-stun-submit") {
        next.enemy.stunThreshold = finite(
          i.fields.getTextInputValue("threshold"),
          "stun threshold",
          0.001,
          1_000_000,
        );
        next.enemy.stunDurationMs = Math.round(
          finite(
            i.fields.getTextInputValue("seconds"),
            "stun duration",
            0.001,
            300,
          ) * 1000,
        );
        next.enemy.stunMultiplier = finite(
          i.fields.getTextInputValue("multiplier"),
          "stun multiplier",
          1,
          100,
        );
      } else if (action === "target-resistance-submit") {
        const el = i.fields.getStringSelectValues("element")[0];
        if (!ELEMENTS.includes(el as (typeof ELEMENTS)[number]))
          throw new Error("Unknown element");
        next.enemy.resistance[el as (typeof ELEMENTS)[number]] = finite(
          i.fields.getTextInputValue("resistance"),
          "resistance",
          -100,
          100,
        );
      } else throw new Error("Unknown enemy edit");
      // Native edits preserve the target's verified anomaly/phase model.
      next.customEnemy = structuredClone(next.enemy);
      next.enemyPreset = undefined;
      compiled(next);
      commit(next);
      await i.reply({ ...panel(next), flags: MessageFlags.Ephemeral });
      return;
    }
    if (i.isStringSelectMenu() && action === "mode") {
      const mode = i.values[0];
      if (mode !== "fixed-duration" && mode !== "kill")
        throw new Error("Unknown calculation mode");
      const next = structuredClone(s);
      if (next.mode !== mode)
        next.durationMs = mode === "kill" ? 300_000 : 90_000;
      next.mode = mode;
      commit(next);
      await i.update(panel(next));
      return;
    }
    if (i.isStringSelectMenu() && action === "report-page") {
      const page = i.values[0];
      if (!["summary", "actions", "timeline"].includes(page))
        throw new Error("Unknown result page");
      if (!s.result) throw new Error(e.noResults);
      const next = structuredClone(s);
      next.reportPage = page as Session["reportPage"];
      await i.deferUpdate();
      const file = new AttachmentBuilder(
        await renderCombatResult(
          s.result.result,
          s.result.scenario,
          s.locale,
          next.reportPage,
        ),
        { name: "combat.png" },
      );
      commit(next, false);
      const payload = panel(next);
      payload.embeds[0].setImage("attachment://combat.png");
      await i.editReply({ ...payload, attachments: [], files: [file] });
      return;
    }
    if (i.isButton() && action === "download") {
      if (!s.result) throw new Error(e.noResults);
      await i.reply({
        files: [
          new AttachmentBuilder(
            gzipSync(exportCombatResult(s.result.result, s.result.scenario)),
            { name: "combat-details.json.gz" },
          ),
          new AttachmentBuilder(Buffer.from(exportCombatCsv(s.result.result)), {
            name: "combat-damage.csv",
          }),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (i.isButton() && action === "reference") {
      await i.deferReply({ flags: MessageFlags.Ephemeral });
      const live = createLiveDamageSession(s.owner, s.characters);
      await i.editReply(await buildLiveDamageMessage(live));
      return;
    }
    if (i.isButton() && action === "import") {
      await i.showModal(
        new ModalBuilder()
          .setCustomId(`zcombat:import-file:${s.id}:${s.revision}`)
          .setTitle(t.import)
          .addLabelComponents(
            new LabelBuilder()
              .setLabel(e.file)
              .setFileUploadComponent(
                new FileUploadBuilder()
                  .setCustomId("file")
                  .setMinValues(1)
                  .setMaxValues(1)
                  .setRequired(),
              ),
          ),
      );
      return;
    }
    if (i.isButton() && ["promotion", "settings"].includes(action)) {
      const modal = new ModalBuilder()
        .setCustomId(`zcombat:${action}-submit:${s.id}:${s.revision}`)
        .setTitle(action === "promotion" ? e.completeData : e.settings);
      const input = (key: string, label: string, value?: number) =>
        new LabelBuilder().setLabel(label).setTextInputComponent(
          new TextInputBuilder()
            .setCustomId(key)
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(10)
            .setValue(value === undefined ? "" : String(value)),
        );
      if (action === "promotion") {
        modal.addLabelComponents(
          input(
            "agent",
            e.promotion,
            s.promotions?.[s.selected]?.agent ??
              s.characters[s.selected].promote_level,
          ),
        );
        if (s.characters[s.selected].weapon)
          modal.addLabelComponents(
            input(
              "weapon",
              e.weaponPromotion,
              s.promotions?.[s.selected]?.weapon ??
                s.characters[s.selected].weapon.promote_level,
            ),
          );
      } else {
        modal.addLabelComponents(
          input("duration", e.duration, s.durationMs / 1000),
          input("trials", e.trials, s.trials),
          input("seed", e.seed, s.seed),
          new LabelBuilder().setLabel(e.loop).setStringSelectMenuComponent(
            new StringSelectMenuBuilder().setCustomId("loop").addOptions([
              { label: "↻", value: "true", default: s.loop },
              { label: "1×", value: "false", default: !s.loop },
            ]),
          ),
        );
      }
      await i.showModal(modal);
      return;
    }
    if (action.startsWith("r-")) {
      const scenario = compiled(s),
        next = structuredClone(s),
        state = next.rotationSelection;
      let edit: RotationEdit | undefined;
      if (i.isButton() && ["r-wait", "r-edit"].includes(action)) {
        await i.showModal(
          rotationModal(
            action === "r-edit" ? scenario.rotation[state.step] : undefined,
            s.locale,
            `zcombat:${action}-submit:${id}:${s.revision}`,
          ),
        );
        return;
      }
      if (i.isModalSubmit()) {
        if (!["r-wait-submit", "r-edit-submit"].includes(action))
          throw new Error("Unknown rotation edit");
        const count = integer(
          i.fields.getTextInputValue("repeat"),
          "repeat count",
          1,
          100,
        );
        let step: RotationStep =
          action === "r-wait-submit"
            ? {
                type: "wait",
                ms: integer(
                  i.fields.getTextInputValue("ms"),
                  "wait duration",
                  1,
                  300_000,
                ),
              }
            : structuredClone(scenario.rotation[state.step]);
        if (step.type === "wait")
          step.ms = integer(
            i.fields.getTextInputValue("ms"),
            "wait duration",
            1,
            300_000,
          );
        if (step.type === "action")
          step.when = stepCondition(
            i.fields.getStringSelectValues("when")[0],
            step.when?.resource,
          );
        if (step.type === "action") {
          const policy = i.fields.getStringSelectValues("unavailable")[0];
          if (policy !== undefined) {
            if (!["skip", "wait", "error"].includes(policy))
              throw new Error("Unknown unavailable action behavior");
            step.onUnavailable = policy as "skip" | "wait" | "error";
            if (policy === "wait")
              step.maxWaitMs = integer(
                i.fields.getTextInputValue("maxWait"),
                "maximum wait",
                1,
                300_000,
              );
            else delete step.maxWaitMs;
          }
        }
        if (step.type === "repeat") step.count = count;
        else step = repeatStep(step, count);
        edit =
          action === "r-wait-submit"
            ? { type: "insert", index: state.step + 1, step }
            : { type: "replace", index: state.step, step };
      } else if (i.isStringSelectMenu()) {
        const value = i.values[0];
        if (action === "r-step")
          state.step = integer(value, "step", 0, scenario.rotation.length - 1);
        else if (action === "r-actor") {
          state.actor = integer(value, "actor", 0, scenario.team.length - 1);
          state.actionPage = 0;
        } else if (action === "r-action") {
          edit = {
            type: "insert",
            index: state.step + 1,
            step: {
              type: "action",
              actor: scenario.team[state.actor].id,
              action: value,
            },
          };
          state.picking = false;
        } else throw new Error("Unknown rotation edit");
      } else if (action === "r-add") {
        state.picking = true;
        state.actionPage = 0;
      } else if (action === "r-back") state.picking = false;
      else if (action === "r-switch")
        edit = {
          type: "insert",
          index: state.step + 1,
          step: { type: "switch", actor: scenario.team[state.actor].id },
        };
      else if (action === "r-delete")
        edit = { type: "delete", index: state.step };
      else if (["r-up", "r-down"].includes(action))
        edit = {
          type: "move",
          index: state.step,
          to: state.step + (action === "r-up" ? -1 : 1),
        };
      else if (["r-prev", "r-next"].includes(action)) {
        const delta = action === "r-prev" ? -1 : 1;
        if (state.picking)
          state.actionPage = integer(
            state.actionPage + delta,
            "page",
            0,
            Math.floor(
              (Object.values(scenario.team[state.actor].actions).filter(
                (a) => a.execution !== "trigger",
              ).length -
                1) /
                25,
            ),
          );
        else
          state.step = Math.max(
            0,
            Math.min(
              scenario.rotation.length - 1,
              Math.floor(state.step / 20) * 20 + delta * 20,
            ),
          );
      } else throw new Error("Unknown rotation edit");
      if (edit) {
        next.rotation = editRotation(scenario.rotation, edit, scenario.team);
        state.step = Math.min(
          edit.type === "insert"
            ? edit.index
            : edit.type === "move"
              ? edit.to
              : state.step,
          next.rotation.length - 1,
        );
      }
      compiled(next);
      commit(next, Boolean(edit));
      if (i.isModalSubmit())
        await i.reply({ ...panel(next), flags: MessageFlags.Ephemeral });
      else await i.update(panel(next));
      return;
    }
    if (
      i.isModalSubmit() &&
      ["import-file", "settings-submit", "promotion-submit"].includes(action)
    ) {
      const next = structuredClone(s);
      if (action === "import-file") {
        const uploads = i.fields.getUploadedFiles("file", true);
        if (uploads.size !== 1) throw new Error("Upload exactly one plan");
        await i.deferReply({ flags: MessageFlags.Ephemeral });
        restoreDocument(
          next,
          importDocument(
            await readPlanAttachment(uploads.first()!),
            combatCatalog,
          ),
        );
      } else if (action === "promotion-submit") {
        const promotion = {
          agent: integer(
            i.fields.getTextInputValue("agent"),
            "promotion",
            0,
            6,
          ),
          ...(s.characters[s.selected].weapon
            ? {
                weapon: integer(
                  i.fields.getTextInputValue("weapon"),
                  "weapon promotion",
                  0,
                  6,
                ),
              }
            : {}),
        };
        importBuildSpec(s.characters[s.selected], promotion);
        next.promotions ??= {};
        next.promotions[next.selected] = promotion;
      } else {
        next.durationMs =
          integer(i.fields.getTextInputValue("duration"), "seconds", 30, 300) *
          1000;
        next.trials = integer(
          i.fields.getTextInputValue("trials"),
          "trials",
          1,
          100,
        );
        next.seed = integer(
          i.fields.getTextInputValue("seed"),
          "seed",
          0,
          0xffffffff,
        );
        next.loop = i.fields.getStringSelectValues("loop")[0] === "true";
        compiled(next);
      }
      commit(next);
      if (i.deferred) await i.editReply(panel(next));
      else await i.reply({ ...panel(next), flags: MessageFlags.Ephemeral });
      return;
    }
    if (i.isButton() && ["import", "restore"].includes(action)) {
      await i.showModal(
        new ModalBuilder()
          .setCustomId(`zcombat:${action}-submit:${s.id}:${s.revision}`)
          .setTitle(t.import)
          .addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder()
                .setCustomId("json")
                .setLabel(action === "restore" ? "ID" : "JSON")
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setMaxLength(4000),
            ),
          ),
      );
      return;
    }
    if (i.isButton() && action === "edit") {
      const page = s.page;
      const value =
        page === "rotation"
          ? exportRotation(compiled(s).rotation)
          : page === "equipment"
            ? JSON.stringify((s.specs ?? sourceSpecs(s))[s.selected], null, 2)
            : JSON.stringify(
                {
                  durationMs: s.durationMs,
                  enemy: s.enemy ?? combatDefaults.enemy,
                  incoming: s.incoming ?? [],
                },
                null,
                2,
              );
      if (value.length > 4000)
        throw new Error(
          "This configuration exceeds the Discord form limit; export it for review.",
        );
      await i.showModal(
        new ModalBuilder()
          .setCustomId(`zcombat:edit-${page}:${s.id}:${s.revision}`)
          .setTitle(t.edit)
          .addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder()
                .setCustomId("json")
                .setLabel(pageLabel(page, s.locale))
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setMaxLength(4000)
                .setValue(value),
            ),
          ),
      );
      return;
    }
    if (i.isModalSubmit()) {
      // Validate a copy. A failed edit never corrupts the live draft.
      const next = structuredClone(s),
        text = i.fields.getTextInputValue("json");
      if (action === "restore-submit") {
        const saved = await getPlans(db).get(text.trim(), s.owner);
        if (!saved.document)
          throw new Error(
            "This older plan has no editable equipment; reimport equipment",
          );
        restoreDocument(next, saved.document);
        next.lastPlan = saved.id;
      } else if (action === "import-submit") {
        restoreDocument(next, importDocument(text, combatCatalog));
      } else if (action === "edit-equipment") {
        const input = JSON.parse(text) as BuildSpec;
        if (
          input.id !== String(s.characters[s.selected].id) ||
          input.kind !== "agent"
        )
          throw new Error(
            "Choose another character from the profile/team page",
          );
        combatCatalog.compile(input);
        next.specs ??= sourceSpecs(next);
        next.specs[next.selected] = input;
      } else if (action === "edit-rotation")
        next.rotation = importRotation(text, compiled(s).team);
      else {
        const input = JSON.parse(text);
        next.durationMs = input.durationMs;
        next.enemy = input.enemy;
        next.customEnemy = structuredClone(input.enemy);
        next.enemyPreset = undefined;
        next.incoming = input.incoming ?? [];
      }
      compiled(next);
      commit(next);
      await i.reply({ ...panel(next), flags: MessageFlags.Ephemeral });
      return;
    }
    if (i.isStringSelectMenu()) {
      const value = i.values[0],
        next = structuredClone(s);
      if (action === "page") {
        if (
          ![
            "score",
            "equipment",
            "weapons",
            "discs",
            "target",
            "initial",
            "rotation",
            "results",
          ].includes(value)
        )
          throw new Error("Invalid page");
        next.page = value as Page;
      } else if (action === "actor") {
        const n = Number(value);
        if (!Number.isInteger(n) || !s.characters[n])
          throw new Error("Invalid actor");
        next.selected = n;
      } else if (action === "build") {
        scoreCharacter(s.characters[s.selected], s.weights, value);
        next.builds[s.selected] = value;
      } else throw new Error("Unknown action");
      panel(next);
      commit(next, false);
      if (next.page === "results" && next.result) {
        await i.deferUpdate();
        const payload = panel(next);
        payload.embeds[0].setImage("attachment://combat.png");
        await i.editReply({
          ...payload,
          attachments: [],
          files: [
            new AttachmentBuilder(
              await renderCombatResult(
                next.result.result,
                next.result.scenario,
                next.locale,
                next.reportPage,
              ),
              { name: "combat.png" },
            ),
          ],
        });
      } else await i.update(panel(next));
      return;
    }
    if (action === "open" || action === "simulate") {
      s.page = action === "open" ? "score" : "equipment";
      await i.reply({ ...panel(s), flags: MessageFlags.Ephemeral });
      return;
    }
    if (action === "cancel") {
      const run = running.get(s.owner);
      if (run) run.cancelled = true;
      combatJobs.cancel(s.owner);
      await i.reply({ content: t.cancel, flags: MessageFlags.Ephemeral });
      return;
    }
    const plans = getPlans(db),
      scenario = compiled(s);
    if (action === "save") {
      const doc = document(s);
      await i.deferUpdate();
      const plan = await plans.create(s.owner, scenario, doc.name, doc),
        next = structuredClone(s);
      next.lastPlan = plan.id;
      commit(next, false);
      await i.editReply(panel(next));
      return;
    }
    if (action === "export") {
      const content = exportDocument(document(s));
      await i.reply({
        files: [
          new AttachmentBuilder(Buffer.from(content), {
            name: "combat-plan.json",
          }),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (action === "run" || action === "compare") {
      if (running.has(s.owner))
        throw new Error("A simulation is already running for this user");
      const run = { cancelled: false };
      running.set(s.owner, run);
      try {
        await i.deferReply({ flags: MessageFlags.Ephemeral });
        const execute = async (input: SimulationScenario) => {
          const cached = await plans.cached(input);
          if (run.cancelled) throw new Error("Simulation cancelled");
          const result =
            cached ?? (await combatJobs.submit(s.owner, input).promise);
          if (run.cancelled) throw new Error("Simulation cancelled");
          await plans.cache(result);
          return result;
        };
        const result = await execute(scenario);
        const files = [
          new AttachmentBuilder(
            await renderCombatResult(result, scenario, s.locale),
            { name: "combat.png" },
          ),
          new AttachmentBuilder(
            gzipSync(exportCombatResult(result, scenario)),
            { name: "combat-details.json.gz" },
          ),
        ];
        let content: string | undefined;
        if (action === "compare") {
          // Same enemy, rotation, duration and seed; only the actors' builds change.
          const baseline = {
            ...scenario,
            ...combatCatalog.compileFormation(sourceSpecs(s), s.bangboo),
          };
          const original = await execute(baseline),
            delta = compareDamage(original, result);
          content =
            scenario.mode === "kill"
              ? `${t.current}: ${x.killRate} ${(original.kill.rate * 100).toFixed(1)}% · ${original.kill.meanTimeMs === null ? x.timeout : `${(original.kill.meanTimeMs / 1000).toFixed(2)}s`}\n${t.hypothetical}: ${x.killRate} ${(result.kill.rate * 100).toFixed(1)}% · ${result.kill.meanTimeMs === null ? x.timeout : `${(result.kill.meanTimeMs / 1000).toFixed(2)}s`}${delta.killTimeMs === null ? "" : `\nΔ ${(delta.killTimeMs / 1000).toFixed(2)}s`}`
              : `${t.current}: ${original.meanDps?.toFixed(1) ?? "—"} DPS\n${t.hypothetical}: ${result.meanDps?.toFixed(1) ?? "—"} DPS\nΔ ${delta.dps?.toFixed(1) ?? "—"} DPS${delta.percent === null ? "" : ` (${delta.percent.toFixed(1)}%)`}`;
          files.push(
            new AttachmentBuilder(
              gzipSync(exportCombatResult(original, baseline)),
              { name: "combat-baseline.json.gz" },
            ),
          );
        }
        if (run.cancelled) throw new Error("Simulation cancelled");
        if (sessions.get(id)?.revision === expectedRevision) {
          const next = structuredClone(s);
          next.result = { scenario, result };
          next.page = "results";
          next.reportPage = "summary";
          commit(next, false);
          const payload = panel(next);
          payload.embeds[0].setImage("attachment://combat.png");
          await i.editReply({ ...payload, content, attachments: [], files });
        } else
          await i.editReply({ content, files, allowedMentions: { parse: [] } });
      } finally {
        if (running.get(s.owner) === run) running.delete(s.owner);
      }
      return;
    }
    throw new Error("Unknown combat action");
  } catch (error) {
    const content = String(
      error instanceof Error ? error.message : t.unverified,
    ).slice(0, 1900);
    if (i.deferred) await i.editReply({ content });
    else if (i.replied)
      await i.followUp({ content, flags: MessageFlags.Ephemeral });
    else await i.reply({ content, flags: MessageFlags.Ephemeral });
  }
}
