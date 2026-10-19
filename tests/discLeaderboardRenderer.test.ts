import { createCanvas, loadImage } from "@napi-rs/canvas";
import { renderDiscLeaderboard } from "../src/utilities/zzz/discLeaderboardRenderer.js";
import {
  DISC_LOCALES,
  discText,
} from "../src/utilities/zzz/discLeaderboardCopy.js";

test.each(DISC_LOCALES)(
  "%s empty and populated ranking PNGs use localized copy and fit the approved layout",
  async (locale) => {
    const proto = Object.getPrototypeOf(createCanvas(1, 1).getContext("2d"));
    const spy = jest.spyOn(proto, "fillText");
    try {
      const base = {
        locale,
        characterName: "Sunna",
        characterId: "1491",
        portraitSource: null,
        accent: "#b0d2ae",
        scopeLabel: discText(locale, "global"),
        page: 1,
        pageCount: 1,
        participantCount: 0,
        entries: [],
        updatedLabel: discText(locale, "noData"),
      };
      const empty = await loadImage(await renderDiscLeaderboard(base));
      expect(empty.width).toBe(1000);
      expect(empty.height).toBe(606);
      expect(
        spy.mock.calls.some((call) => call[0] === discText(locale, "empty")),
      ).toBe(true);
      const row = {
        rank: 1,
        playerName:
          "A very long player name that must be trimmed without covering the total score",
        nickname: "Proxy In Game",
        uid: "1300000001",
        portraitSource: "missing-test-art.png",
        skinName: null,
        total: 490.5,
        grade: "SS",
        updatedLabel: "10/02 16:00",
        isViewer: true,
      };
      const full = await loadImage(
        await renderDiscLeaderboard({
          ...base,
          entries: [row],
          participantCount: 1,
          viewer: row,
        }),
      );
      expect(full.height).toBe(empty.height);
      expect(spy.mock.calls.filter(call => call[0] === "UID 1300000001")).toHaveLength(2);
      expect(spy.mock.calls.filter(call => call[0] === row.nickname)).toHaveLength(2);
      expect(spy.mock.calls.some(call => String(call[0]).startsWith("Discord · "))).toBe(false);
      expect(spy.mock.calls.filter(call => String(call[0]).startsWith("A very long player name"))).toHaveLength(2);
      expect(spy.mock.calls.some(call => call[0] === "#1")).toBe(true);
      expect(spy.mock.calls.some((call) => call[0] === row.playerName)).toBe(
        false,
      );
      expect(
        spy.mock.calls.some((call) => call[0] === discText(locale, "you")),
      ).toBe(true);
      expect(
        spy.mock.calls.some((call) => call[0] === discText(locale, "art")),
      ).toBe(false);
      expect(
        spy.mock.calls.some((call) => call[0] === discText(locale, "rules")),
      ).toBe(false);
      expect(
        spy.mock.calls.some(
          (call) => call[0] === discText(locale, "effectiveRolls"),
        ),
      ).toBe(true);
      expect(spy.mock.calls.some((call) => call[0] === "—")).toBe(true);
      spy.mockClear();
      await renderDiscLeaderboard({
        ...base,
        entries: [
          { ...row, skinName: "蕾米埃爾·月夜密語", effectiveRolls: 36 },
        ],
        participantCount: 1,
      });
      expect(spy.mock.calls.some((call) => call[0] === "月夜密語")).toBe(true);
      expect(spy.mock.calls.some((call) => call[0] === "36")).toBe(true);
      spy.mockClear();
      await renderDiscLeaderboard({ ...base, participating: false });
      expect(spy.mock.calls.some(call => call[0] === discText(locale, "left"))).toBe(true);
      expect(spy.mock.calls.some(call => call[0] === discText(locale, "rejoinPrompt"))).toBe(true);
      expect(spy.mock.calls.some(call => call[0] === discText(locale, "rankPrompt"))).toBe(false);
    } finally {
      spy.mockRestore();
    }
  },
);

test("the personal card loads the viewer's own art and avatar even outside the current page", async () => {
  const solidImage = (color: string) => {
    const canvas = createCanvas(30, 30), ctx = canvas.getContext("2d");
    ctx.fillStyle = color; ctx.fillRect(0, 0, 30, 30);
    return canvas.toDataURL("image/png");
  };
  const row = { rank: 1, playerName: "First", nickname: "First in game", uid: "1300000001", portraitSource: null, skinName: null, total: 530, updatedLabel: "10/03 18:00" };
  const viewer = { ...row, rank: 14, playerName: "Viewer Discord", nickname: "Viewer in game", uid: "1300000014", total: 480,
    portraitSource: solidImage("#ff0000"), avatarSource: solidImage("#0000ff") };
  const png = await renderDiscLeaderboard({ locale: "en", characterName: "Agent", characterId: "1581", portraitSource: null, accent: "#eaa6c5", scopeLabel: "Global", page: 1, pageCount: 2, participantCount: 20, entries: [row], viewer, updatedLabel: row.updatedLabel });
  const image = await loadImage(png), canvas = createCanvas(image.width, image.height), ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0);
  const footerY = image.height - 240 + 16;
  expect(Array.from(ctx.getImageData(230, footerY + 80, 1, 1).data)).toEqual([255, 0, 0, 255]);
  expect(Array.from(ctx.getImageData(303, footerY + 93, 1, 1).data)).toEqual([0, 0, 255, 255]);
});
