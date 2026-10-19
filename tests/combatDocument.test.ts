import {
  CombatCatalog,
  parseBuildSpec,
  type BuildSpec,
} from "../src/utilities/zzz/combat/catalog.js";
import {
  compileDocument,
  exportDocument,
  importDocument,
  MAX_PLAN_BYTES,
  readPlanAttachment,
  validateDocument,
  type CombatDocument,
} from "../src/utilities/zzz/combat/document.js";
import { testActor, testScenario } from "./fixtures/combat.js";
import {
  editRotation,
  repeatStep,
} from "../src/utilities/zzz/combat/rotationEditor.js";
import {
  newRotationSelection,
  rotationComponents,
  rotationModal,
} from "../src/utilities/zzz/combat/rotationPanel.js";
import { editorText } from "../src/utilities/zzz/combat/editorCopy.js";
import {
  compareDamage,
  damageSummary,
} from "../src/utilities/zzz/combat/results.js";
import { simulate } from "../src/utilities/zzz/combat/engine.js";

const spec = (id = "test_a"): BuildSpec => ({
  id,
  kind: "agent",
  level: 60,
  promotion: 6,
  cinema: 0,
  skills: { basic: 12 },
  weapon: null,
  discs: [],
});
const catalog = new CombatCatalog(
  "synthetic-1",
  ["test_a", "test_b"].map((id) => ({
    id,
    version: "synthetic-1",
    sources: ["synthetic"],
    compile: (s: BuildSpec) => {
      const actor = testActor(id);
      actor.level = s.level;
      actor.cinema = s.cinema;
      actor.panel.atk += s.cinema * 100;
      return actor;
    },
  })),
);
const document = (): CombatDocument => {
  const s = testScenario();
  return {
    schemaVersion: 3,
    mode: "fixed-duration",
    modelVersion: catalog.version,
    name: "Test team",
    specs: [spec()],
    baseline: [spec()],
    enemy: s.enemy,
    durationMs: 45_000,
    trials: 13,
    seed: 123456,
    rotation: s.rotation,
    incoming: [{ atMs: 1000, windowMs: 100 }],
    loop: false,
    switchMs: 321,
  };
};
test("portable plans preserve all settings and recompile both builds after editing a restored plan", () => {
  const doc = document();
  doc.specs[0].cinema = 2;
  const restored = importDocument(exportDocument(doc), catalog);
  expect(restored).toEqual(doc);
  expect(compileDocument(restored, catalog).team[0].panel.atk).toBe(1200);
  expect(compileDocument(restored, catalog, true).team[0].panel.atk).toBe(1000);
  restored.durationMs = 60_000;
  expect(compileDocument(restored, catalog)).toMatchObject({
    durationMs: 60_000,
    trials: 13,
    seed: 123456,
    switchMs: 321,
    loop: false,
    incoming: doc.incoming,
  });
});
test("team adapters see identical starting panels regardless of execution order", () => {
  const teamCatalog = new CombatCatalog(
    "synthetic-1",
    ["test_a", "test_b"].map((id) => ({
      id,
      version: "synthetic-1",
      sources: ["synthetic"],
      compile: () => testActor(id),
      configureTeam: (
        actor: ReturnType<typeof testActor>,
        initial: readonly ReturnType<typeof testActor>[],
      ) => {
        actor.panel.atk +=
          initial.find((a) => a.id !== actor.id)!.panel.atk * 0.4;
        return actor;
      },
    })),
  );
  expect(
    teamCatalog
      .compileFormation([spec("test_a"), spec("test_b")])
      .team.map((a) => a.panel.atk),
  ).toEqual([1400, 1400]);
});
test("uploaded executable snapshots, mismatched versions/teams and account metadata are not accepted as models", () => {
  const doc = document();
  const clean = validateDocument(
    {
      ...doc,
      owner: "123",
      scenario: testScenario(),
      specs: [{ ...spec(), owner: "secret", panel: { atk: 1e8 } }],
    },
    catalog,
  );
  expect(exportDocument(clean)).not.toMatch(/secret|owner|panel/);
  expect(() =>
    validateDocument({ ...doc, modelVersion: "old" }, catalog),
  ).toThrow("outdated");
  expect(() =>
    validateDocument({ ...doc, baseline: [spec("test_b")] }, catalog),
  ).toThrow("same team");
  expect(() =>
    parseBuildSpec({ ...spec(), skills: { constructor: 1 } }),
  ).toThrow();
  expect(() => importDocument(" ".repeat(MAX_PLAN_BYTES + 1), catalog)).toThrow(
    "too large",
  );
});
test("attachments stream beyond the text modal limit, reject redirects/foreign hosts and enforce actual byte size", async () => {
  const text = exportDocument(document()) + " ".repeat(5000);
  const file = {
    name: "combat.json",
    size: Buffer.byteLength(text),
    url: "https://cdn.discordapp.com/attachments/123/456/combat.json?ex=signed",
  };
  const fetcher = jest.fn(async () => new Response(text)) as any;
  expect(await readPlanAttachment(file, fetcher)).toBe(text);
  expect(fetcher.mock.calls[0][1].redirect).toBe("error");
  await expect(
    readPlanAttachment(
      { ...file, url: "https://example.org/attachments/123/456/combat.json" },
      fetcher,
    ),
  ).rejects.toThrow("URL");
  await expect(
    readPlanAttachment({ ...file, name: "file.js" }, fetcher),
  ).rejects.toThrow("JSON");
  await expect(
    readPlanAttachment(
      { ...file, size: 1 },
      async () => new Response(" ".repeat(MAX_PLAN_BYTES + 1)),
    ),
  ).rejects.toThrow("too large");
  await expect(
    readPlanAttachment(file, async () => new Response(new Uint8Array([0xff]))),
  ).rejects.toThrow();
});
test("rotation edits are atomic, retain nested repeats and reject unavailable actions and expansion overflow", () => {
  const actor = testActor(),
    original = testScenario().rotation;
  const steps = editRotation(
    original,
    {
      type: "insert",
      index: 1,
      step: repeatStep({ type: "wait", ms: 250 }, 3),
    },
    [actor],
  );
  expect(original).toHaveLength(1);
  expect(steps).toHaveLength(2);
  const moved = editRotation(steps, { type: "move", index: 1, to: 0 }, [actor]);
  expect(moved[0]).toEqual(steps[1]);
  expect(() =>
    editRotation(original, { type: "delete", index: 0 }, [actor]),
  ).toThrow();
  expect(() =>
    editRotation(
      original,
      {
        type: "insert",
        index: 1,
        step: { type: "action", actor: actor.id, action: "missing" },
      },
      [actor],
    ),
  ).toThrow();
  expect(() =>
    editRotation(
      original,
      {
        type: "insert",
        index: 1,
        step: repeatStep(
          repeatStep(repeatStep({ type: "wait", ms: 1 }, 100), 100),
          100,
        ),
      },
      [actor],
    ),
  ).toThrow("large");
});
test("rotation components and modals satisfy Discord limits in all seven languages", () => {
  const actor = testActor();
  for (let index = 0; index < 60; index++)
    actor.actions[`action${index}`] = {
      ...actor.actions.basic,
      id: `action${index}`,
      name: `Action ${index}`,
    };
  actor.actions.passive = {
    ...actor.actions.basic,
    id: "passive",
    execution: "trigger",
  };
  const steps = Array.from({ length: 45 }, () => testScenario().rotation[0]);
  for (const locale of ["tw", "cn", "en", "jp", "kr", "fr", "vi"]) {
    expect(Object.values(editorText(locale)).every(Boolean)).toBe(true);
    for (const picking of [false, true]) {
      const rows = rotationComponents(
        steps,
        [actor],
        { ...newRotationSelection(), step: 40, picking, actionPage: 2 },
        locale,
        (a) => `zcombat:${a}:test:1`,
      );
      expect(rows.length).toBeLessThanOrEqual(4);
      rows.forEach((row) => expect(() => row.toJSON()).not.toThrow());
    }
    expect(() =>
      rotationModal(steps[0], locale, "edit").toJSON(),
    ).not.toThrow();
  }
  expect(editorText("zh-TW").addAction).toBe("新增招式");
});
test("summary includes zero damage members and handles a zero baseline comparison", () => {
  const s = testScenario();
  s.team.push(testActor("test_b"));
  s.team[0].panel.atk = 0;
  const zero = simulate(s),
    rows = damageSummary(zero, s);
  expect(rows).toHaveLength(2);
  expect(rows.every((row) => row.share === 0)).toBe(true);
  s.team[0].panel.atk = 1000;
  const next = simulate(s);
  expect(compareDamage(zero, next)).toMatchObject({
    percent: null,
    damage: 15_000,
    dps: 500,
  });
});

test("version 2 imports migrate to fixed-duration without changing the original document or model defaults", () => {
  const original: any = { ...document(), schemaVersion: 2 };
  delete original.mode;
  const before = structuredClone(original);
  const migrated = validateDocument(original, catalog);
  expect(original).toEqual(before);
  expect(migrated).toEqual({
    ...before,
    schemaVersion: 3,
    mode: "fixed-duration",
  });
  const scenario = compileDocument(migrated, catalog);
  expect(scenario.initialState).toBeUndefined();
  expect(scenario.team[0].resources.energy.initial).toBe(0);
  expect(scenario.mode).toBe("fixed-duration");
  expect(() =>
    validateDocument({ ...original, mode: "kill" }, catalog),
  ).toThrow("Version 2");
  expect(() =>
    validateDocument({ ...original, modelVersion: "old" }, catalog),
  ).toThrow("outdated");
});

test("version 3 round-trips kill HP, sparse initial resources, data versions and conditional waits", () => {
  const doc = document();
  doc.mode = "kill";
  doc.enemy.hp = 12_345;
  doc.gameDataVersion = "fixture-data-1";
  doc.rotationVersion = "fixture-rotation-2";
  doc.initialState = {
    activeActor: "test_a",
    resources: { test_a: { energy: 12 } },
  };
  doc.rotation = [
    {
      type: "action",
      actor: "test_a",
      action: "basic",
      onUnavailable: "wait",
      maxWaitMs: 4000,
    },
  ];
  const restored = importDocument(exportDocument(doc), catalog);
  expect(restored).toEqual(doc);
  const scenario = compileDocument(restored, catalog);
  expect(scenario).toMatchObject({
    mode: "kill",
    enemy: { hp: 12_345 },
    initialState: doc.initialState,
    gameDataVersion: "fixture-data-1",
    rotationVersion: "fixture-rotation-2",
  });
  expect(scenario.team[0].resources.energy.initial).toBe(0);
});

test("invalid v3 setup requires missing fields instead of coercing modes, resources or versions", () => {
  const doc = document();
  expect(() => validateDocument({ ...doc, mode: undefined }, catalog)).toThrow(
    "Version 3",
  );
  expect(() => validateDocument({ ...doc, mode: "kill" }, catalog)).toThrow(
    /HP|hp/,
  );
  expect(() =>
    validateDocument({ ...doc, gameDataVersion: "" }, catalog),
  ).toThrow(/version/i);
  expect(() =>
    validateDocument(
      { ...doc, initialState: { activeActor: "missing", resources: {} } },
      catalog,
    ),
  ).toThrow();
  expect(() =>
    validateDocument(
      {
        ...doc,
        initialState: {
          activeActor: "test_a",
          resources: { test_a: { energy: 101 } },
        },
      },
      catalog,
    ),
  ).toThrow();
  expect(() =>
    validateDocument(
      {
        ...doc,
        initialState: {
          activeActor: "test_a",
          resources: { test_a: { invented: 10 } },
        },
      },
      catalog,
    ),
  ).toThrow();
  expect(doc).toEqual(document());
});

test("portable v3 plans strip nested account metadata while retaining authored target clocks and shields", () => {
  const doc: any = document();
  doc.enemy.owner = "private-enemy-owner";
  doc.enemy.resistance.uid = "private-uid";
  doc.enemy.shield = {
    hp: 500,
    sources: ["synthetic shield"],
    cookie: "private-cookie",
  };
  doc.enemy.phases = [
    {
      id: "phase",
      atMs: 1000,
      clock: "animation",
      sources: ["synthetic phase"],
      owner: "private-phase-owner",
      shield: {
        hp: 20,
        sources: ["synthetic shield"],
        owner: "private-shield-owner",
      },
    },
  ];
  doc.incoming = [
    {
      atMs: 100,
      windowMs: 100,
      clock: "animation",
      owner: "private-incoming-owner",
    },
  ];
  doc.rotation = [
    {
      type: "action",
      actor: "test_a",
      action: "basic",
      when: {
        resource: {
          name: "energy",
          atLeast: 0,
          owner: "private-resource-owner",
        },
      },
    },
  ];
  const clean = validateDocument(doc, catalog);
  const exported = exportDocument(clean);
  expect(exported).not.toMatch(/private-|owner|cookie|uid/);
  expect(clean.enemy.shield).toEqual({
    hp: 500,
    sources: ["synthetic shield"],
  });
  expect(clean.enemy.phases?.[0]).toMatchObject({
    clock: "animation",
    shield: { hp: 20 },
  });
  expect(clean.incoming[0].clock).toBe("animation");
  expect(doc.enemy.owner).toBe("private-enemy-owner");
});
