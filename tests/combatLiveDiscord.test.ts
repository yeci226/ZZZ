jest.mock("../src/utilities/zzz/combat/release.js", () => ({
  combatReleased: jest.fn(() => true),
}));
import { loadImage } from "@napi-rs/canvas";
import fixture from "./fixtures/liveCombat.json";
import {
  buildLiveDamageMessage,
  createLiveDamageSession,
  handleLiveDamageInteraction,
  liveDamageResult,
} from "../src/utilities/zzz/combat/liveDamageDiscord.js";
import {
  buildCombatEntry,
  handleCombatInteraction,
} from "../src/utilities/zzz/combat/workbench.js";
import { combatReleased } from "../src/utilities/zzz/combat/release.js";

function interaction(
  customId: string,
  type = "button",
  values: Record<string, any> = {},
): any {
  const i: any = {
    customId,
    locale: "zh-TW",
    user: { id: "owner" },
    deferred: false,
    replied: false,
    isButton: () => type === "button",
    isStringSelectMenu: () => type === "select",
    isModalSubmit: () => type === "modal",
    isFromMessage: () => true,
    fields: { getTextInputValue: (id: string) => values[id] ?? "" },
    values: values.values ?? [],
    reply: jest.fn(async () => {
      i.replied = true;
    }),
    followUp: jest.fn(),
    showModal: jest.fn(),
    editReply: jest.fn(),
    deferUpdate: jest.fn(async () => {
      i.deferred = true;
    }),
    deferReply: jest.fn(async () => {
      i.deferred = true;
    }),
  };
  return i;
}
function key(payload: any, action: string) {
  return payload.components
    .flatMap((row: any) => row.toJSON().components)
    .find((c: any) => c.custom_id.includes(`:${action}:`)).custom_id;
}
const db: any = { get: jest.fn(), set: jest.fn() };

test("the team entry opens a real PNG attachment with valid Discord components", async () => {
  const entry = buildCombatEntry("owner", "tw", fixture);
  const open = interaction(key({ components: entry }, "reference"));
  await handleCombatInteraction(open, db);
  expect(open.deferReply).toHaveBeenCalled();
  const payload = open.editReply.mock.calls[0][0];
  const image = await loadImage(payload.files[0].attachment);
  expect([image.width, image.height]).toEqual([1000, 850]);
  expect(payload.embeds[0].toJSON().image.url).toBe(
    "attachment://zzz-damage.png",
  );
  expect(payload.components).toHaveLength(5);
  for (const row of payload.components)
    for (const c of row.toJSON().components) {
      expect(c.custom_id.length).toBeLessThanOrEqual(100);
      if (c.options) expect(c.options.length).toBeLessThanOrEqual(25);
    }
  expect(payload.allowedMentions.parse).toEqual([]);
});

test("native target settings recalculate, replace old attachments, and reject stale or foreign controls", async () => {
  const state = createLiveDamageSession("owner", fixture),
    first = await buildLiveDamageMessage(state);
  const stun = interaction(key(first, "live-stun"));
  await handleCombatInteraction(stun, db);
  const next = stun.editReply.mock.calls[0][0];
  expect(next.attachments).toEqual([]);
  expect(next.files[0].description).toContain("27,222");
  const stale = interaction(key(first, "live-stun"));
  await handleLiveDamageInteraction(stale);
  expect(stale.reply.mock.calls[0][0].content).toContain("已更新或失效");
  const foreign = interaction(key(next, "live-export"));
  foreign.user.id = "someone-else";
  await handleLiveDamageInteraction(foreign);
  expect(foreign.reply.mock.calls[0][0].files).toBeUndefined();
  const settings = interaction(key(next, "live-target"));
  await handleLiveDamageInteraction(settings);
  const modalId = settings.showModal.mock.calls[0][0].toJSON().custom_id;
  const bad = interaction(modalId, "modal", {
    defense: "NaN",
    resistance: "0",
    stunMultiplier: "1.5",
  });
  await handleLiveDamageInteraction(bad);
  expect(bad.editReply).not.toHaveBeenCalled();
  const valid = interaction(modalId, "modal", {
    defense: "953",
    resistance: "0",
    stunMultiplier: "2",
  });
  await handleLiveDamageInteraction(valid);
  expect(valid.editReply.mock.calls[0][0].files[0].description).toContain(
    "36,296",
  );
});

test("manual team entries retain their conditions when other selections change", async () => {
  let payload = await buildLiveDamageMessage(
    createLiveDamageSession("owner", fixture),
  );
  const act = async (action: string, type = "button", values = {}) => {
    const i = interaction(key(payload, action), type, values);
    await handleLiveDamageInteraction(i);
    if (i.editReply.mock.calls.length) payload = i.editReply.mock.calls[0][0];
    return i;
  };
  await act("live-add");
  await act("live-conditions", "select", {
    values: ["phase", "signatureActive"],
  });
  await act("live-add");
  await act("live-view");
  const exported = await act("live-export");
  const output = JSON.parse(
    exported.reply.mock.calls[0][0].files[0].attachment.toString(),
  );
  expect(output.result.rows).toHaveLength(2);
  expect(output.result.rows[0].conditions.chaosJazz).toBe(true);
  expect(output.result.rows[0].conditions.phase).toBe(false);
  expect(output.result.rows[1].conditions.phase).toBe(true);
  expect(output.result.rows[0].expected).toBeCloseTo(18147.915);
  expect(output.result.total).toBeCloseTo(
    output.result.rows.reduce((sum: number, row: any) => sum + row.expected, 0),
  );
  expect(output.result.completeSimulation).toBe(false);
  expect(output.result.modeledDps).toBeNull();
  expect(JSON.stringify(output)).not.toMatch(
    /cookie|owner|uid|offline-preview/,
  );
  await act("live-clear");
  expect(payload.components[4].toJSON().components[0].disabled).toBe(true);
});

test("the production release gate also blocks live component IDs", async () => {
  const state = createLiveDamageSession("owner", fixture);
  expect(liveDamageResult(state).total).toBeCloseTo(18147.915);
  (combatReleased as jest.Mock).mockReturnValueOnce(false);
  const i = interaction(`zcombat:live-export:${state.id}:1`);
  await handleCombatInteraction(i, db);
  expect(i.reply.mock.calls[0][0].files).toBeUndefined();
});
