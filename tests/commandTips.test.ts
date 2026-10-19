import {
  commandTipContent,
  selectCommandTip,
  withCommandTip,
  COMMAND_TIP_POOLS,
  type CommandTipPool,
} from "../src/utilities/core/commandTips.js";
import { messageSubtext } from "../src/utilities/core/messageSubtext.js";

test.each(["en", "tw", "cn", "jp", "kr", "fr", "vi"])(
  "every context has three distinct localized choices in %s",
  (locale) => {
    for (const pool of Object.keys(COMMAND_TIP_POOLS) as CommandTipPool[]) {
      const variants = [0, 1, 2].map((index) =>
        selectCommandTip(pool, locale, (n) => {
          expect(n).toBe(3);
          return index;
        }),
      );
      expect(new Set(variants).size).toBe(3);
      expect(
        variants.every(
          (text) => !!text && text.includes("/") && text.length < 300,
        ),
      ).toBe(true);
      if (locale !== "en")
        expect(variants).not.toEqual(
          [0, 1, 2].map((index) => selectCommandTip(pool, "en", () => index)),
        );
    }
  },
);
test("status, card data and attachments survive while the hint stays stable on updates", () => {
  const interaction = { id: "initial-tip-test" };
  const files = [{ name: "card.png" }],
    embeds = [{ description: "unchanged" }];
  const payload = withCommandTip(interaction, "profile", "tw", {
    content: "同步中",
    files,
    embeds,
  });
  expect(payload.files).toBe(files);
  expect(payload.embeds).toBe(embeds);
  expect(payload.content).toContain("同步中\n-# 💡 ");
  const hint = payload.content.split("\n").at(-1);
  const background = commandTipContent(
    interaction,
    "profile",
    "tw",
    "同步完成",
  );
  expect(background).toBe(`同步完成\n${hint}`);
  const component = {
    id: "new-component",
    message: {
      id: "tip-message",
      content: background,
      interactionMetadata: { id: interaction.id },
    },
  };
  const switched = commandTipContent(component, "profile", "tw", "已切換角色");
  expect(switched).toBe(`已切換角色\n${hint}`);
  expect(commandTipContent(component, "profile", "tw", switched)).toBe(
    switched,
  );
  expect(messageSubtext(switched).match(/💡/g)).toHaveLength(1);
});
test("existing message content recovers the exact choice without interaction metadata", () => {
  const hint = selectCommandTip("banner", "jp", () => 2);
  const component = { message: { content: `卡池\n-# 💡 ${hint}` } };
  expect(commandTipContent(component, "banner", "en", "更新")).toBe(
    `更新\n-# 💡 ${hint}`,
  );
});
test("V2, existing content near the limit and payloads are not damaged", () => {
  const interaction = {},
    content = "x".repeat(1990);
  expect(commandTipContent(interaction, "daily", "tw", content)).toBe(content);
  const payload = { flags: 32768, components: [{ type: 10, content: "V2" }] };
  expect(withCommandTip(interaction, "daily", "tw", payload)).toBe(payload);
  expect(
    withCommandTip(
      { message: { flags: { bitfield: 32768 } } },
      "daily",
      "tw",
      payload,
    ),
  ).toBe(payload);
  expect(
    commandTipContent({ message: { flags: 32768 } }, "daily", "tw", "original"),
  ).toBe("original");
});
