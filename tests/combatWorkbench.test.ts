jest.mock("../src/utilities/zzz/combat/release.js", () => ({
  combatReleased: () => true,
}));
jest.mock("../src/utilities/zzz/combat/catalog.js", () => {
  const actual = jest.requireActual("../src/utilities/zzz/combat/catalog.js");
  const { testActor, testScenario } = jest.requireActual(
    "./fixtures/combat.js",
  );
  return {
    ...actual,
    combatCatalog: new actual.CombatCatalog(
      "synthetic-1",
      ["1011", "1021"].map((id) => ({
        id,
        version: "synthetic-1",
        sources: ["synthetic"],
        compile: (spec: any) => {
          const a = testActor(id);
          a.level = spec.level;
          a.cinema = spec.cinema;
          a.panel.atk += spec.cinema * 100;
          return a;
        },
      })),
    ),
    combatDefaults: { enemy: testScenario().enemy, switchMs: 100 },
  };
});
jest.mock("../src/utilities/zzz/combat/jobs.js", () => ({
  combatJobs: {
    submit: jest.fn((_owner: string, scenario: any) => ({
      promise: Promise.resolve(
        jest
          .requireActual("../src/utilities/zzz/combat/engine.js")
          .simulate(scenario),
      ),
    })),
    cancel: jest.fn(),
  },
}));
import { Collection } from "discord.js";
import {
  buildCombatEntry,
  handleCombatInteraction,
} from "../src/utilities/zzz/combat/workbench.js";
import { combatJobs } from "../src/utilities/zzz/combat/jobs.js";
import { combatCatalog } from "../src/utilities/zzz/combat/catalog.js";
import { testScenario } from "./fixtures/combat.js";
import * as documents from "../src/utilities/zzz/combat/document.js";

function db() {
  const values = new Map<string, any>();
  return {
    values,
    get: async (key: string) => structuredClone(values.get(key)),
    set: async (key: string, value: any) => {
      values.set(key, structuredClone(value));
    },
    delete: async (key: string) => {
      values.delete(key);
    },
  };
}
function interaction(
  customId: string,
  type: "button" | "select" | "modal",
  values: Record<string, any> = {},
): any {
  const i: any = {
    customId,
    locale: "zh-TW",
    user: { id: "123" },
    deferred: false,
    replied: false,
    isButton: () => type === "button",
    isStringSelectMenu: () => type === "select",
    isModalSubmit: () => type === "modal",
    values: values.values ?? [],
    fields: {
      getTextInputValue: (id: string) => values[id] ?? "",
      getStringSelectValues: (id: string) => [values[id]],
      getUploadedFiles: () =>
        new Collection([
          [
            "1",
            {
              name: "plan.json",
              size: 5000,
              url: "https://cdn.discordapp.com/attachments/1/2/plan.json",
            },
          ],
        ]),
    },
    reply: jest.fn(async () => {
      i.replied = true;
    }),
    update: jest.fn(),
    editReply: jest.fn(),
    followUp: jest.fn(),
    showModal: jest.fn(),
    deferReply: jest.fn(async () => {
      i.deferred = true;
    }),
    deferUpdate: jest.fn(async () => {
      i.deferred = true;
    }),
  };
  return i;
}
function key(payload: any, action: string): string {
  const first = payload.components[0].components[0].data.custom_id.split(":");
  return `zcombat:${action}:${first[2]}:${first[3]}`;
}
async function open(
  store: ReturnType<typeof db>,
  promotion = true,
  properties?: unknown[],
) {
  const rows = buildCombatEntry("123", "tw", [
    {
      id: 1011,
      name_mi18n: "Synthetic agent",
      ...(properties ? { properties } : {}),
      level: 60,
      rank: 0,
      ...(promotion ? { promote_level: 6 } : {}),
      weapon: null,
      equip: [],
      skills: [{ skill_type: 0, level: 12 }],
    },
  ]);
  const i = interaction(
    (rows[0].components[1].toJSON() as { custom_id: string }).custom_id,
    "button",
  );
  await handleCombatInteraction(i, store);
  return i.reply.mock.calls[0][0];
}

test("a missing promotion has an editable form instead of requiring a complete JSON build", async () => {
  const store = db(),
    initial = await open(store, false);
  const edit = interaction(key(initial, "promotion"), "button");
  await handleCombatInteraction(edit, store);
  expect(() => edit.showModal.mock.calls[0][0].toJSON()).not.toThrow();
  const modal = interaction(key(initial, "promotion-submit"), "modal", {
    agent: "6",
  });
  await handleCombatInteraction(modal, store);
  expect(modal.reply.mock.calls[0][0].embeds).toBeDefined();
  const run = interaction(key(modal.reply.mock.calls[0][0], "run"), "button");
  await handleCombatInteraction(run, store);
  expect(run.editReply.mock.calls[0][0].files).toHaveLength(2);
});
test("saved plans restore all settings, remain editable and compare against the original build", async () => {
  const store = db();
  let payload = await open(store);
  const settings = interaction(key(payload, "settings-submit"), "modal", {
    duration: "45",
    trials: "3",
    seed: "999",
    loop: "false",
  });
  await handleCombatInteraction(settings, store);
  payload = settings.reply.mock.calls[0][0];
  const save = interaction(key(payload, "save"), "button");
  await handleCombatInteraction(save, store);
  payload = save.editReply.mock.calls[0][0];
  const saved = [...store.values.entries()].find(([k]) =>
    k.startsWith("combatPlans."),
  )![1];
  expect(saved.document).toMatchObject({
    durationMs: 45_000,
    seed: 999,
    trials: 3,
    loop: false,
  });
  const restore = interaction(key(payload, "restore-submit"), "modal", {
    json: saved.id,
  });
  await handleCombatInteraction(restore, store);
  payload = restore.reply.mock.calls[0][0];
  const edit = interaction(key(payload, "edit-equipment"), "modal", {
    json: JSON.stringify({ ...saved.document.specs[0], cinema: 2 }),
  });
  await handleCombatInteraction(edit, store);
  payload = edit.reply.mock.calls[0][0];
  const compare = interaction(key(payload, "compare"), "button");
  await handleCombatInteraction(compare, store);
  const output = compare.editReply.mock.calls[0][0];
  expect(output.content).toContain("20.0%");
  expect(output.files).toHaveLength(3);
  const scenarios = (combatJobs.submit as jest.Mock).mock.calls.map(
    (call) => call[1],
  );
  expect(
    scenarios.every(
      (s) =>
        s.durationMs === 45_000 && s.seed === 999 && s.trials === 3 && !s.loop,
    ),
  ).toBe(true);
  expect(scenarios.map((s) => s.team[0].panel.atk)).toEqual([1200, 1000]);
});
test("rotation buttons add waits and reorder/delete steps without stale edits changing the draft", async () => {
  const store = db();
  let payload = await open(store);
  const select = interaction(key(payload, "page"), "select", {
    values: ["rotation"],
  });
  await handleCombatInteraction(select, store);
  payload = select.update.mock.calls[0][0];
  expect(payload.components).toHaveLength(5);
  payload.components.forEach((r: any) => r.toJSON());
  const staleKey = key(payload, "r-wait-submit");
  const add = interaction(staleKey, "modal", { ms: "250", repeat: "2" });
  await handleCombatInteraction(add, store);
  payload = add.reply.mock.calls[0][0];
  const stale = interaction(staleKey, "modal", { ms: "999", repeat: "1" });
  await handleCombatInteraction(stale, store);
  expect(stale.reply.mock.calls[0][0].content).toContain("過期");
  const move = interaction(key(payload, "r-up"), "button");
  await handleCombatInteraction(move, store);
  payload = move.update.mock.calls[0][0];
  const exported = interaction(key(payload, "export"), "button");
  await handleCombatInteraction(exported, store);
  const doc = JSON.parse(
    exported.reply.mock.calls[0][0].files[0].attachment.toString(),
  );
  expect(doc.rotation[0]).toEqual({
    type: "repeat",
    count: 2,
    steps: [{ type: "wait", ms: 250 }],
  });
});
test("file upload round-trips a full plan and rejects a submission superseded while downloading", async () => {
  const store = db();
  let payload = await open(store);
  const exporting = interaction(key(payload, "export"), "button");
  await handleCombatInteraction(exporting, store);
  const text =
    exporting.reply.mock.calls[0][0].files[0].attachment.toString() +
    " ".repeat(5000);
  const spy = jest.spyOn(documents, "readPlanAttachment");
  try {
    const show = interaction(key(payload, "import"), "button");
    await handleCombatInteraction(show, store);
    expect(
      show.showModal.mock.calls[0][0].toJSON().components[0].component.type,
    ).toBe(19);
    spy.mockResolvedValueOnce(text);
    const importing = interaction(key(payload, "import-file"), "modal");
    await handleCombatInteraction(importing, store);
    payload = importing.editReply.mock.calls[0][0];
    expect(payload.embeds).toBeDefined();
    let finish!: (value: string) => void;
    spy.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const slow = interaction(key(payload, "import-file"), "modal"),
      pending = handleCombatInteraction(slow, store);
    await Promise.resolve();
    await Promise.resolve();
    const newer = interaction(key(payload, "page"), "select", {
      values: ["target"],
    });
    await handleCombatInteraction(newer, store);
    finish(text);
    await pending;
    expect(slow.editReply.mock.calls[0][0].content).toContain("過期");
  } finally {
    spy.mockRestore();
  }
});

test("cancelling between comparison phases prevents the second simulation from starting", async () => {
  const store = db(),
    payload = await open(store);
  const get = store.get;
  let cacheReads = 0,
    release!: () => void,
    reached!: () => void;
  const secondPhase = new Promise<void>((resolve) => {
    reached = resolve;
  });
  store.get = async (key: string) => {
    if (key.startsWith("combatResults.") && ++cacheReads === 2) {
      reached();
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    }
    return get(key);
  };
  const compare = interaction(key(payload, "compare"), "button");
  const pending = handleCombatInteraction(compare, store);
  await secondPhase;
  const cancel = interaction(key(payload, "cancel"), "button");
  await handleCombatInteraction(cancel, store);
  release();
  await pending;
  expect(combatJobs.submit).toHaveBeenCalledTimes(1);
  expect(compare.editReply.mock.calls[0][0].content).toContain("cancelled");
});

test("native target controls select kill mode, require HP and preserve custom resistance and stun settings", async () => {
  const store = db();
  let payload = await open(store);
  const select = interaction(key(payload, "page"), "select", {
    values: ["target"],
  });
  await handleCombatInteraction(select, store);
  payload = select.update.mock.calls[0][0];
  expect(payload.components).toHaveLength(5);
  payload.components.forEach((r: any) => r.toJSON());
  const mode = interaction(key(payload, "mode"), "select", {
    values: ["kill"],
  });
  await handleCombatInteraction(mode, store);
  payload = mode.update.mock.calls[0][0];
  expect(payload.embeds[0].data.description).toContain("300s");
  const show = interaction(key(payload, "target-basic"), "button");
  await handleCombatInteraction(show, store);
  expect(() => show.showModal.mock.calls[0][0].toJSON()).not.toThrow();
  const invalid = interaction(key(payload, "target-basic-submit"), "modal", {
    level: "70",
    defense: "1200",
    hp: "",
  });
  await handleCombatInteraction(invalid, store);
  expect(invalid.reply.mock.calls[0][0].content).toContain("血量");
  const valid = interaction(key(payload, "target-basic-submit"), "modal", {
    level: "70",
    defense: "1200",
    hp: "12345",
  });
  await handleCombatInteraction(valid, store);
  payload = valid.reply.mock.calls[0][0];
  const resistance = interaction(
    key(payload, "target-resistance-submit"),
    "modal",
    { element: "fire", resistance: "-20" },
  );
  await handleCombatInteraction(resistance, store);
  payload = resistance.reply.mock.calls[0][0];
  const stun = interaction(key(payload, "target-stun-submit"), "modal", {
    threshold: "200",
    seconds: "4.5",
    multiplier: "2",
  });
  await handleCombatInteraction(stun, store);
  payload = stun.reply.mock.calls[0][0];
  const exported = interaction(key(payload, "export"), "button");
  await handleCombatInteraction(exported, store);
  const doc = JSON.parse(
    exported.reply.mock.calls[0][0].files[0].attachment.toString(),
  );
  expect(doc).toMatchObject({
    schemaVersion: 3,
    mode: "kill",
    durationMs: 300_000,
    enemy: {
      level: 70,
      defense: 1200,
      hp: 12345,
      resistance: { physical: 0, fire: -20 },
      stunThreshold: 200,
      stunDurationMs: 4500,
      stunMultiplier: 2,
    },
  });
  const fixed = interaction(key(payload, "mode"), "select", {
    values: ["fixed-duration"],
  });
  await handleCombatInteraction(fixed, store);
  expect(fixed.update.mock.calls[0][0].embeds[0].data.description).toContain(
    "90s",
  );
});

test("initial resources use model defaults and native edits reject overfill without changing the draft", async () => {
  const store = db();
  let payload = await open(store);
  const select = interaction(key(payload, "page"), "select", {
    values: ["initial"],
  });
  await handleCombatInteraction(select, store);
  payload = select.update.mock.calls[0][0];
  expect(JSON.stringify(payload.embeds[0].data)).toContain("energy: 0 / 100");
  payload.components.forEach((r: any) => r.toJSON());
  const show = interaction(key(payload, "initial-edit"), "button");
  await handleCombatInteraction(show, store);
  expect(
    show.showModal.mock.calls[0][0].toJSON().components[0].component.value,
  ).toBe("0");
  const invalid = interaction(key(payload, "initial-submit"), "modal", {
    amount: "101",
  });
  await handleCombatInteraction(invalid, store);
  expect(invalid.reply.mock.calls[0][0].content).toContain("initial resource");
  const valid = interaction(key(payload, "initial-submit"), "modal", {
    amount: "50",
  });
  await handleCombatInteraction(valid, store);
  payload = valid.reply.mock.calls[0][0];
  const exported = interaction(key(payload, "export"), "button");
  await handleCombatInteraction(exported, store);
  expect(
    JSON.parse(exported.reply.mock.calls[0][0].files[0].attachment.toString())
      .initialState,
  ).toEqual({ activeActor: "1011", resources: { "1011": { energy: 50 } } });
  const reset = interaction(key(payload, "initial-reset"), "button");
  await handleCombatInteraction(reset, store);
  expect(
    JSON.stringify(reset.update.mock.calls[0][0].embeds[0].data),
  ).toContain("energy: 0 / 100");
});

test("result tabs attach native image pages and downloads export JSON plus CSV", async () => {
  const store = db();
  let payload = await open(store);
  const run = interaction(key(payload, "run"), "button");
  await handleCombatInteraction(run, store);
  payload = run.editReply.mock.calls[0][0];
  expect(payload.embeds[0].data.image.url).toBe("attachment://combat.png");
  expect(payload.components).toHaveLength(5);
  payload.components.forEach((r: any) => r.toJSON());
  for (const page of ["actions", "timeline", "summary"]) {
    const select = interaction(key(payload, "report-page"), "select", {
      values: [page],
    });
    await handleCombatInteraction(select, store);
    payload = select.editReply.mock.calls[0][0];
    expect(payload.files).toHaveLength(1);
    expect(payload.files[0].name).toBe("combat.png");
    expect(payload.files[0].attachment.subarray(1, 4).toString()).toBe("PNG");
  }
  const download = interaction(key(payload, "download"), "button");
  await handleCombatInteraction(download, store);
  expect(download.reply.mock.calls[0][0].files.map((f: any) => f.name)).toEqual(
    ["combat-details.json.gz", "combat-damage.csv"],
  );
});

test("native conditional step editing preserves an explicit wait limit in portable plans", async () => {
  const store = db();
  let payload = await open(store);
  const select = interaction(key(payload, "page"), "select", {
    values: ["rotation"],
  });
  await handleCombatInteraction(select, store);
  payload = select.update.mock.calls[0][0];
  const step = interaction(key(payload, "r-step"), "select", { values: ["1"] });
  await handleCombatInteraction(step, store);
  payload = step.update.mock.calls[0][0];
  const show = interaction(key(payload, "r-edit"), "button");
  await handleCombatInteraction(show, store);
  expect(() => show.showModal.mock.calls[0][0].toJSON()).not.toThrow();
  const edit = interaction(key(payload, "r-edit-submit"), "modal", {
    repeat: "1",
    when: "always",
    unavailable: "wait",
    maxWait: "2500",
  });
  await handleCombatInteraction(edit, store);
  payload = edit.reply.mock.calls[0][0];
  const exported = interaction(key(payload, "export"), "button");
  await handleCombatInteraction(exported, store);
  expect(
    JSON.parse(exported.reply.mock.calls[0][0].files[0].attachment.toString())
      .rotation[1],
  ).toMatchObject({ type: "action", onUnavailable: "wait", maxWaitMs: 2500 });
});

test("kill-mode Discord summaries report defeat rate and completion time without a fabricated horizon DPS", async () => {
  const store = db();
  let payload = await open(store);
  const mode = interaction(key(payload, "mode"), "select", {
    values: ["kill"],
  });
  await handleCombatInteraction(mode, store);
  payload = mode.update.mock.calls[0][0];
  const enemy = interaction(key(payload, "target-basic-submit"), "modal", {
    level: "70",
    defense: "1000",
    hp: "1000",
  });
  await handleCombatInteraction(enemy, store);
  payload = enemy.reply.mock.calls[0][0];
  const run = interaction(key(payload, "run"), "button");
  await handleCombatInteraction(run, store);
  payload = run.editReply.mock.calls[0][0];
  const fields = payload.embeds[0].data.fields;
  expect(fields.find((f: any) => f.name === "擊殺率").value).toBe("100.0%");
  expect(
    fields.find((f: any) => f.name === "成功場次擊殺時間").value,
  ).toContain("1.00s");
  expect(fields.find((f: any) => f.name === "平均傷害").value).not.toContain(
    "DPS",
  );
});

const displayedProperties = (atk = 1000) =>
  [
    [1, 10000],
    [2, atk],
    [3, 600],
    [4, 100],
    [5, 0],
    [6, 50],
    [7, 100],
    [8, 100],
    [9, 0],
    [11, 1],
    [232, 0],
  ].map(([property_id, final]) => ({
    property_id,
    final: String(final),
    base: property_id === 2 ? "1000" : String(final),
  }));

test("official baseline displays must match the reconstructed original build before simulation", async () => {
  const store = db();
  const payload = await open(store, true, displayedProperties(9999));
  const run = interaction(key(payload, "run"), "button");
  await handleCombatInteraction(run, store);
  expect(run.reply.mock.calls[0][0].content).toContain(
    "atk (model 1000, official 9999)",
  );
  expect(combatJobs.submit).not.toHaveBeenCalled();
});

test("display checks preserve promotion completion and compare the baseline, not hypothetical gear", async () => {
  const store = db();
  let payload = await open(store, false, displayedProperties());
  const promotion = interaction(key(payload, "promotion-submit"), "modal", {
    agent: "6",
  });
  await handleCombatInteraction(promotion, store);
  payload = promotion.reply.mock.calls[0][0];
  const exported = interaction(key(payload, "export"), "button");
  await handleCombatInteraction(exported, store);
  const spec = JSON.parse(
    exported.reply.mock.calls[0][0].files[0].attachment.toString(),
  ).specs[0];
  const edit = interaction(key(payload, "edit-equipment"), "modal", {
    json: JSON.stringify({ ...spec, cinema: 2 }),
  });
  await handleCombatInteraction(edit, store);
  payload = edit.reply.mock.calls[0][0];
  const run = interaction(key(payload, "run"), "button");
  await handleCombatInteraction(run, store);
  expect(run.editReply.mock.calls[0][0].files).toHaveLength(2);
  expect(
    (combatJobs.submit as jest.Mock).mock.calls[0][1].team[0].panel.atk,
  ).toBe(1200);
});

test("verified enemy selection paginates, excludes unreviewed targets and restores custom fields", async () => {
  const presets = Array.from(
    { length: 30 },
    (_, index) => `fixture_enemy_${index}`,
  );
  const list = jest
    .spyOn(combatCatalog, "supportedEnemies")
    .mockReturnValue(["unreviewed", ...presets]);
  const enemy = jest.spyOn(combatCatalog, "enemy").mockImplementation((id) => {
    if (id === "unreviewed") throw new Error("not verified");
    return { ...testScenario().enemy, defense: 2345, hp: 10000 };
  });
  const sources = jest
    .spyOn(combatCatalog, "enemySources")
    .mockReturnValue(["synthetic target fixture — not game data"]);
  try {
    const store = db();
    let payload = await open(store);
    const select = interaction(key(payload, "page"), "select", {
      values: ["target"],
    });
    await handleCombatInteraction(select, store);
    payload = select.update.mock.calls[0][0];
    expect(JSON.stringify(payload.embeds[0].data)).toContain("已驗證場景預設");
    const edit = interaction(key(payload, "target-basic-submit"), "modal", {
      level: "80",
      defense: "1700",
      hp: "12345",
    });
    await handleCombatInteraction(edit, store);
    payload = edit.reply.mock.calls[0][0];
    const pick = interaction(key(payload, "enemy-pick"), "button");
    await handleCombatInteraction(pick, store);
    payload = pick.update.mock.calls[0][0];
    expect(payload.components).toHaveLength(5);
    payload.components.forEach((r: any) => r.toJSON());
    const choices = payload.components[1].components[0].toJSON().options;
    expect(choices).toHaveLength(25);
    expect(choices.map((c: any) => c.value)).not.toContain("unreviewed");
    const next = interaction(key(payload, "enemy-next"), "button");
    await handleCombatInteraction(next, store);
    payload = next.update.mock.calls[0][0];
    expect(
      payload.components[1].components[0]
        .toJSON()
        .options.map((c: any) => c.value),
    ).toContain("fixture_enemy_29");
    const choose = interaction(key(payload, "enemy-preset"), "select", {
      values: ["fixture_enemy_29"],
    });
    await handleCombatInteraction(choose, store);
    payload = choose.update.mock.calls[0][0];
    expect(JSON.stringify(payload.embeds[0].data)).toContain(
      "synthetic target fixture",
    );
    expect(JSON.stringify(payload.embeds[0].data)).toContain("DEF 2345");
    const custom = interaction(key(payload, "enemy-preset"), "select", {
      values: ["__custom__"],
    });
    await handleCombatInteraction(custom, store);
    payload = custom.update.mock.calls[0][0];
    expect(JSON.stringify(payload.embeds[0].data)).toContain("DEF 1700");
    expect(JSON.stringify(payload.embeds[0].data)).toContain("HP 12345");
    expect(JSON.stringify(payload.embeds[0].data)).toContain("自訂／匯入目標");
  } finally {
    list.mockRestore();
    enemy.mockRestore();
    sources.mockRestore();
  }
});

test("native agent and skill edits change only hypothetical choices and preserve the imported comparison baseline", async () => {
  const store = db();
  let payload = await open(store, true, displayedProperties());
  payload.components.forEach((r: any) => r.toJSON());
  const show = interaction(key(payload, "equipment-agent"), "button");
  await handleCombatInteraction(show, store);
  expect(show.showModal.mock.calls[0][0].toJSON().components).toHaveLength(4);
  const invalid = interaction(key(payload, "equipment-agent-submit"), "modal", {
    level: "60",
    promotion: "6",
    cinema: "7",
    awakening: "0",
  });
  await handleCombatInteraction(invalid, store);
  expect(invalid.reply.mock.calls[0][0].content).toContain("cinema");
  const actor = interaction(key(payload, "equipment-agent-submit"), "modal", {
    level: "60",
    promotion: "6",
    cinema: "2",
    awakening: "0",
  });
  await handleCombatInteraction(actor, store);
  payload = actor.reply.mock.calls[0][0];
  const skillShow = interaction(key(payload, "equipment-skill"), "button");
  await handleCombatInteraction(skillShow, store);
  expect(
    skillShow.showModal.mock.calls[0][0].toJSON().components[0].component
      .options[0].label,
  ).toContain("普通攻擊");
  const skill = interaction(key(payload, "equipment-skill-submit"), "modal", {
    skill: "0",
    level: "10",
  });
  await handleCombatInteraction(skill, store);
  payload = skill.reply.mock.calls[0][0];
  const exported = interaction(key(payload, "export"), "button");
  await handleCombatInteraction(exported, store);
  const doc = JSON.parse(
    exported.reply.mock.calls[0][0].files[0].attachment.toString(),
  );
  expect(doc.baseline[0]).toMatchObject({ cinema: 0, skills: { "0": 12 } });
  expect(doc.specs[0]).toMatchObject({ cinema: 2, skills: { "0": 10 } });
  const compare = interaction(key(payload, "compare"), "button");
  await handleCombatInteraction(compare, store);
  expect(compare.editReply.mock.calls[0][0].content).toContain("20.0%");
  expect(
    (combatJobs.submit as jest.Mock).mock.calls.map(
      (call) => call[1].team[0].panel.atk,
    ),
  ).toEqual([1200, 1000]);
});

async function openPortableGear(
  store: ReturnType<typeof db>,
  gear: Record<string, unknown>,
) {
  const initial = await open(store);
  const exporting = interaction(key(initial, "export"), "button");
  await handleCombatInteraction(exporting, store);
  const doc = JSON.parse(
    exporting.reply.mock.calls[0][0].files[0].attachment.toString(),
  );
  doc.baseline[0] = { ...doc.baseline[0], ...gear };
  doc.specs[0] = structuredClone(doc.baseline[0]);
  const importing = interaction(key(initial, "import-submit"), "modal", {
    json: JSON.stringify(doc),
  });
  await handleCombatInteraction(importing, store);
  return importing.reply.mock.calls[0][0];
}

async function exportedDraft(payload: any, store: ReturnType<typeof db>) {
  const exporting = interaction(key(payload, "export"), "button");
  await handleCombatInteraction(exporting, store);
  return JSON.parse(
    exporting.reply.mock.calls[0][0].files[0].attachment.toString(),
  );
}

test("verified W-Engine picker paginates, requires progression before applying and preserves baseline equipment", async () => {
  const weapons = Array.from({ length: 30 }, (_, index) => `engine_${index}`);
  const registry = jest
    .spyOn(combatCatalog, "supportedEquipment")
    .mockReturnValue({ weapons, sets: [] });
  try {
    const store = db();
    let payload = await open(store);
    const opening = interaction(key(payload, "weapon-open"), "button");
    await handleCombatInteraction(opening, store);
    payload = opening.update.mock.calls[0][0];
    expect(payload.components.length).toBeLessThanOrEqual(5);
    payload.components.forEach((row: any) => row.toJSON());
    expect(payload.components[2].components[0].toJSON().options).toHaveLength(
      25,
    );
    const next = interaction(key(payload, "weapon-next"), "button");
    await handleCombatInteraction(next, store);
    payload = next.update.mock.calls[0][0];
    expect(
      payload.components[2].components[0]
        .toJSON()
        .options.map((o: any) => o.value),
    ).toContain("engine_29");
    const choose = interaction(key(payload, "weapon-choice"), "select", {
      values: ["engine_29"],
    });
    await handleCombatInteraction(choose, store);
    const modal = choose.showModal.mock.calls[0][0].toJSON();
    expect(modal.custom_id.length).toBeLessThanOrEqual(100);
    expect(modal.components[0].component.value).toBe("");
    expect((await exportedDraft(payload, store)).specs[0].weapon).toBeNull();
    const bad = interaction(modal.custom_id, "modal", {
      level: "60",
      promotion: "6",
      refinement: "6",
    });
    await handleCombatInteraction(bad, store);
    expect(bad.reply.mock.calls[0][0].content).toContain("refinement");
    const apply = interaction(modal.custom_id, "modal", {
      level: "60",
      promotion: "6",
      refinement: "2",
    });
    await handleCombatInteraction(apply, store);
    payload = apply.reply.mock.calls[0][0];
    const doc = await exportedDraft(payload, store);
    expect(doc.baseline[0].weapon).toBeNull();
    expect(doc.specs[0].weapon).toEqual({
      id: "engine_29",
      level: 60,
      promotion: 6,
      refinement: 2,
    });
    const unknown = interaction(key(payload, "weapon-choice"), "select", {
      values: ["not_registered"],
    });
    await handleCombatInteraction(unknown, store);
    expect(unknown.reply.mock.calls[0][0].content).toContain("已驗證");
    const remove = interaction(key(payload, "weapon-choice"), "select", {
      values: ["__none__"],
    });
    await handleCombatInteraction(remove, store);
    expect(
      (await exportedDraft(remove.update.mock.calls[0][0], store)).specs[0]
        .weapon,
    ).toBeNull();
  } finally {
    registry.mockRestore();
  }
});

test("empty equipment registries give accurate native messages instead of invented weapon or disc models", async () => {
  const registry = jest
    .spyOn(combatCatalog, "supportedEquipment")
    .mockReturnValue({ weapons: [], sets: [] });
  try {
    const store = db();
    let payload = await openPortableGear(store, {
      discs: [
        {
          setId: "set_a",
          disc: {
            slot: 4,
            rarity: "S",
            level: 15,
            main: { stat: "ATK%", value: 30 },
            subs: [],
          },
        },
      ],
    });
    const weapons = interaction(key(payload, "weapon-open"), "button");
    await handleCombatInteraction(weapons, store);
    payload = weapons.update.mock.calls[0][0];
    expect(JSON.stringify(payload.embeds[0].data)).toContain(
      "尚無已驗證的音擎模型",
    );
    expect(
      payload.components[2].components[0]
        .toJSON()
        .options.map((o: any) => o.value),
    ).toEqual(["__none__"]);
    const discs = interaction(key(payload, "disc-open"), "button");
    await handleCombatInteraction(discs, store);
    payload = discs.update.mock.calls[0][0];
    expect(JSON.stringify(payload.embeds[0].data)).toContain(
      "尚無已驗證的驅動盤套裝模型",
    );
    const main = interaction(key(payload, "disc-main"), "button");
    await handleCombatInteraction(main, store);
    expect(main.reply.mock.calls[0][0].content).toContain("尚無已驗證");
  } finally {
    registry.mockRestore();
  }
});

test("native disc modals validate slot restrictions, duplicate stats, roll values and total rolls atomically", async () => {
  const registry = jest
    .spyOn(combatCatalog, "supportedEquipment")
    .mockReturnValue({ weapons: [], sets: ["set_a"] });
  try {
    const store = db();
    let payload = await openPortableGear(store, {
      discs: [
        {
          setId: "set_a",
          disc: {
            slot: 4,
            rarity: "S",
            level: 15,
            main: { stat: "ATK%", value: 30 },
            subs: [
              { stat: "CRIT_Rate", value: 2.4 },
              { stat: "CRIT_DMG", value: 4.8 },
              { stat: "HP", value: 112 },
            ],
          },
        },
      ],
    });
    const openDiscs = interaction(key(payload, "disc-open"), "button");
    await handleCombatInteraction(openDiscs, store);
    payload = openDiscs.update.mock.calls[0][0];
    expect(payload.components).toHaveLength(5);
    payload.components.forEach((row: any) => row.toJSON());
    const mainShow = interaction(key(payload, "disc-main"), "button");
    await handleCombatInteraction(mainShow, store);
    expect(() => mainShow.showModal.mock.calls[0][0].toJSON()).not.toThrow();
    const invalidSlot = interaction(key(payload, "disc-main-submit"), "modal", {
      stat: "Impact",
      value: "18",
    });
    await handleCombatInteraction(invalidSlot, store);
    expect(invalidSlot.reply.mock.calls[0][0].content).toContain("not allowed");
    const duplicate = interaction(key(payload, "disc-main-submit"), "modal", {
      stat: "CRIT_Rate",
      value: "24",
    });
    await handleCombatInteraction(duplicate, store);
    expect(duplicate.reply.mock.calls[0][0].content).toContain("不能相同");
    const main = interaction(key(payload, "disc-main-submit"), "modal", {
      stat: "Anomaly_Proficiency",
      value: "92",
    });
    await handleCombatInteraction(main, store);
    payload = main.reply.mock.calls[0][0];
    const invalidRoll = interaction(key(payload, "disc-sub-submit"), "modal", {
      stat: "CRIT_Rate",
      value: "10",
    });
    await handleCombatInteraction(invalidRoll, store);
    expect(invalidRoll.reply.mock.calls[0][0].content).toContain(
      "substat rolls",
    );
    const sub = interaction(key(payload, "disc-sub-submit"), "modal", {
      stat: "CRIT_Rate",
      value: "14.4",
    });
    await handleCombatInteraction(sub, store);
    payload = sub.reply.mock.calls[0][0];
    const lowLevel = interaction(key(payload, "disc-level-submit"), "modal", {
      level: "0",
    });
    await handleCombatInteraction(lowLevel, store);
    expect(lowLevel.reply.mock.calls[0][0].content).toContain(
      "exceed disc level",
    );
    const doc = await exportedDraft(payload, store);
    expect(doc.baseline[0].discs[0].disc.main).toEqual({
      stat: "ATK%",
      value: 30,
    });
    expect(doc.baseline[0].discs[0].disc.subs[0].value).toBe(2.4);
    expect(doc.specs[0].discs[0].disc).toMatchObject({
      level: 15,
      main: { stat: "Anomaly_Proficiency", value: 92 },
      subs: [
        { stat: "CRIT_Rate", value: 14.4 },
        { stat: "CRIT_DMG", value: 4.8 },
        { stat: "HP", value: 112 },
      ],
    });
    const remove = interaction(key(payload, "disc-sub-submit"), "modal", {
      stat: "__remove__",
      value: "",
    });
    await handleCombatInteraction(remove, store);
    payload = remove.reply.mock.calls[0][0];
    expect(
      (await exportedDraft(payload, store)).specs[0].discs[0].disc.subs,
    ).toHaveLength(2);
  } finally {
    registry.mockRestore();
  }
});
