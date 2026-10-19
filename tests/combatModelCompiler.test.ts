import {
  CombatCatalog,
  parseBuildSpec,
  type BuildSpec,
} from "../src/utilities/zzz/combat/catalog.js";
import {
  CombatComponentRegistry,
  createActorModel,
  assertImportedPanel,
  type ActorRecipe,
  type WeaponModel,
  type SetModel,
} from "../src/utilities/zzz/combat/modelCompiler.js";
import { testActor, testScenario } from "./fixtures/combat.js";

const version = "synthetic-1",
  sources = ["synthetic model compiler test — not game data"];
const recipe: ActorRecipe = {
  id: "test_a",
  version,
  sources,
  verified: true,
  kind: "agent",
  compile: () => {
    const { panel, modelVersion: _v, provenance: _p, ...rest } = testActor();
    return { ...rest, basePanel: panel };
  },
};
const weapon: WeaponModel = {
  id: "test_weapon",
  version,
  sources,
  verified: true,
  compile: () => ({ baseAttack: 500, displayed: { percent: { atk: 10 } } }),
  configureBattle: (actor, _spec, context) => ({
    ...actor,
    initialBuffs: [
      {
        id: "weapon-battle-only",
        target: "self",
        stat: "atk",
        mode: "flat",
        value: context.basePanel.atk * 0.15,
        durationMs: 30_000,
        maxStacks: 1,
        stacking: "refresh",
      },
    ],
  }),
};
const set: SetModel = {
  id: "test_set",
  version,
  sources,
  verified: true,
  compile: (pieces) =>
    pieces >= 2
      ? { percent: { atk: 20 }, flat: { anomalyProficiency: 30 } }
      : {},
};
const build: BuildSpec = {
  id: "test_a",
  kind: "agent",
  level: 60,
  promotion: 6,
  cinema: 0,
  awakening: 0,
  skills: { basic: 12 },
  weapon: { id: "test_weapon", level: 60, promotion: 6, refinement: 1 },
  discs: [
    {
      setId: "test_set",
      disc: {
        slot: 1,
        rarity: "S",
        level: 15,
        main: { stat: "HP", value: 2200 },
        subs: [{ stat: "ATK", value: 19 }],
      },
    },
    {
      setId: "test_set",
      disc: {
        slot: 4,
        rarity: "S",
        level: 15,
        main: { stat: "ATK%", value: 30 },
        subs: [{ stat: "CRIT_Rate", value: 2.4 }],
      },
    },
  ],
};
function registry(w = weapon, s = set) {
  return new CombatComponentRegistry(version, {
    weapons: [w],
    sets: [s],
    enemies: [
      {
        id: "test_target",
        version,
        sources,
        verified: true,
        compile: () => testScenario().enemy,
      },
    ],
  });
}
test("rebuild uses combined actor+weapon base once, then flat/percent stats and displayed set bonuses", () => {
  const registered = registry(),
    catalog = new CombatCatalog(
      version,
      [createActorModel(recipe, registered)],
      registered,
    );
  const actor = catalog.compile(build);
  expect(actor.panel.atk).toBe(2419); // (1000 + 500) × (1 + .1 + .2 + .3) + 19
  expect(actor.panel.hp).toBe(12200);
  expect(actor.panel.critRate).toBe(2.4);
  expect(actor.panel.anomalyProficiency).toBe(130);
  expect(actor.initialBuffs?.[0].value).toBe(225); // passive uses the original combined base, not 2419
  expect(() =>
    assertImportedPanel(actor, { atk: 2419, critRate: 2.4 }),
  ).not.toThrow();
  expect(() => assertImportedPanel(actor, { atk: 2500 })).toThrow("atk");
  expect(catalog.supportedEquipment()).toEqual({
    weapons: ["test_weapon"],
    sets: ["test_set"],
  });
  expect(catalog.supportedEnemies()).toEqual(["test_target"]);
  const enemy = catalog.enemy("test_target");
  enemy.defense = 0;
  expect(catalog.enemy("test_target").defense).toBe(1000);
});
test("missing, unverified, mismatched and duplicated components cannot silently compile", () => {
  expect(() =>
    createActorModel({ ...recipe, verified: false }, registry()),
  ).toThrow("unverified");
  expect(
    () => new CombatComponentRegistry(version, { weapons: [weapon, weapon] }),
  ).toThrow("registration");
  const model = createActorModel(
    recipe,
    registry({ ...weapon, verified: false }),
  );
  expect(
    registry({ ...weapon, verified: false }).supportedEquipment().weapons,
  ).toEqual([]);
  expect(() => model.compile(build)).toThrow("not verified");
  expect(() =>
    createActorModel(recipe, registry()).compile({
      ...build,
      weapon: { ...build.weapon!, id: "missing" },
    }),
  ).toThrow("not registered");
  expect(() => new CombatCatalog("different", [], registry())).toThrow(
    "version",
  );
});
test("equipment callbacks cannot mutate displayed stats or change actor identity", () => {
  const corrupt = {
    ...weapon,
    configureBattle: (actor: ReturnType<typeof testActor>) => ({
      ...actor,
      panel: { ...actor.panel, atk: actor.panel.atk + 100 },
    }),
  };
  expect(() =>
    createActorModel(recipe, registry(corrupt)).compile(build),
  ).toThrow("displayed panel");
  const identity = {
    ...weapon,
    configureBattle: (actor: ReturnType<typeof testActor>) => ({
      ...actor,
      id: "other",
    }),
  };
  expect(() =>
    createActorModel(recipe, registry(identity)).compile(build),
  ).toThrow("identity");
});
test("recipes, equipment and team effects cannot silently replace requested level or cinema", () => {
  expect(() =>
    createActorModel(recipe, registry()).compile({
      ...build,
      level: 50,
      cinema: 6,
    }),
  ).toThrow("progression");
  for (const changed of [{ level: 50 }, { cinema: 6 }]) {
    const equipment = {
      ...weapon,
      configureBattle: (actor: ReturnType<typeof testActor>) => ({
        ...actor,
        ...changed,
      }),
    };
    expect(() =>
      createActorModel(recipe, registry(equipment)).compile(build),
    ).toThrow("progression");
    const model = createActorModel(
      { ...recipe, configureTeam: (actor) => ({ ...actor, ...changed }) },
      registry(),
    );
    expect(() =>
      new CombatCatalog(version, [model]).compileFormation([build]),
    ).toThrow("progression");
    expect(() =>
      new CombatCatalog(version, [
        {
          id: recipe.id,
          version,
          sources,
          compile: () => ({ ...testActor(), ...changed }),
        },
      ]).compile(build),
    ).toThrow("progression");
  }
});
test("portable build parsing uses percentage display precision for disc rolls", () => {
  const invalid = structuredClone(build);
  invalid.discs[1].disc.subs[0].value = 10; // Four CRIT rolls are 9.6%, not 10%.
  expect(() => parseBuildSpec(invalid)).toThrow("substat rolls");
  invalid.discs[1].disc.subs[0].value = 9.6;
  expect(() => parseBuildSpec(invalid)).not.toThrow();
});
