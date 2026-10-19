import {
  createCanvas,
  loadImage,
  type Image,
  type SKRSContext2D,
} from "@napi-rs/canvas";
import { join } from "node:path";
import { getZzzOfficialFont, getZzzOfficialNumberFont } from "./canvasFonts.js";
import {
  loadGtCardAssets,
  loadGtCardMetadataImages,
  type GtCardItem,
} from "./gtCardRenderer.js";
import {
  formatProfileRank,
  type ProfileMainData,
  type ProfilePeriod,
  type ProfileBattleSummary,
} from "./profileMainData.js";

const WIDTH = 1200;
const SCALE = 2;
const LEFT = 40;
const INNER = WIDTH - LEFT * 2;
const ASSETS = join("src", "assets", "images", "zzz", "official-record");
const FILES = {
  background: "home-bg-pc.4165948d.png",
  deadly: "block-bg-pc.e15121db.png",
  extreme: "hard-row-bg-pc.6439ecd0.png",
  trial: "normal-row-bg-pc.d0db1983.png",
  shiyu: "shiyu-index-block-bg-pc.f1c7320a.png",
  deco: "deco-icon.6d772bca.png",
};
type Translator = (key: string, args?: any) => string;

export function getProfileMainLayout(data: ProfileMainData) {
  const deadly = data.deadly.filter((period) => period.status !== "empty");
  const hasShiyu = data.shiyu.some((period) => period.status !== "empty");
  const agentsY = 320;
  const battleY = data.showcase.length ? 536 : 388;
  const shiyuY = battleY + (deadly.length ? 42 + deadly.length * 158 + 22 : 0);
  return {
    width: WIDTH * SCALE,
    height: (shiyuY + (hasShiyu ? 224 : 0) + 30) * SCALE,
    agentsY,
    battleY,
    shiyuY,
    deadly,
    hasShiyu,
  };
}

function box(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string | CanvasGradient,
  radius = 5,
  stroke?: string,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}
function clip(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius = 5,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.clip();
}
function cover(
  ctx: SKRSContext2D,
  image: Image,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const scale = Math.max(w / image.width, h / image.height);
  ctx.drawImage(
    image,
    x + (w - image.width * scale) / 2,
    y + (h - image.height * scale) / 2,
    image.width * scale,
    image.height * scale,
  );
}
function contain(
  ctx: SKRSContext2D,
  image: Image | null,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  if (!image) return;
  const scale = Math.min(w / image.width, h / image.height);
  ctx.drawImage(
    image,
    x + (w - image.width * scale) / 2,
    y + (h - image.height * scale) / 2,
    image.width * scale,
    image.height * scale,
  );
}
function text(
  ctx: SKRSContext2D,
  value: unknown,
  x: number,
  y: number,
  size: number,
  font: string,
  color = "#ebebeb",
  maxWidth?: number,
  align: "left" | "center" | "right" = "left",
) {
  ctx.font = `${size}px ${font}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  let fitted = String(value ?? "—");
  if (maxWidth) {
    while (ctx.measureText(fitted).width > maxWidth && fitted.length > 1)
      fitted = fitted.slice(0, -2) + "…";
  }
  ctx.fillText(fitted, x, y);
  return ctx.measureText(fitted).width;
}
function section(ctx: SKRSContext2D, title: string, y: number, font: string) {
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(LEFT + i * 6 + 4, y - 16);
    ctx.lineTo(LEFT + i * 6 + 9, y - 16);
    ctx.lineTo(LEFT + i * 6 + 5, y + 1);
    ctx.lineTo(LEFT + i * 6, y + 1);
    ctx.closePath();
    ctx.fillStyle = "#b4b4b4";
    ctx.fill();
  }
  text(ctx, title, LEFT + 30, y, 22, font, "#c8c8c8");
}
function periodLabel(
  ctx: SKRSContext2D,
  period: ProfilePeriod,
  x: number,
  y: number,
  tr: Translator,
  font: string,
  width: number,
) {
  const label = tr(
    period.schedule === 1 ? "profileMain_Current" : "profileMain_Previous",
  );
  ctx.font = `16px ${font}`;
  const labelWidth = Math.min(180, ctx.measureText(label).width + 28);
  box(
    ctx,
    x,
    y - 19,
    labelWidth,
    26,
    period.schedule === 1 ? "#ffe500" : "#444444",
    13,
  );
  text(
    ctx,
    label,
    x + labelWidth / 2,
    y,
    16,
    font,
    period.schedule === 1 ? "#161616" : "#e8e8e8",
    labelWidth - 14,
    "center",
  );
  text(
    ctx,
    [period.start, period.end].filter(Boolean).join(" – "),
    x + labelWidth + 12,
    y,
    14,
    font,
    "#a9a9a9",
    width - labelWidth - 12,
  );
}

/** Pure presentation: credentials and battle-record requests belong to the loader. */
export async function drawOfficialMainProfile(
  tr: Translator,
  locale: string,
  data: ProfileMainData,
): Promise<Buffer> {
  const layout = getProfileMainLayout(data);
  const canvas = createCanvas(layout.width, layout.height);
  const ctx = canvas.getContext("2d");
  ctx.scale(SCALE, SCALE);
  const font = getZzzOfficialFont(locale),
    numFont = getZzzOfficialNumberFont(locale);
  const images = new Map<string, Promise<Image | null>>();
  const image = (source: unknown): Promise<Image | null> => {
    if (typeof source !== "string" || !source) return Promise.resolve(null);
    if (!images.has(source))
      images.set(
        source,
        (async () => {
          try {
            if (/^https?:\/\//.test(source)) {
              const response = await fetch(source, {
                signal: AbortSignal.timeout(8000),
              });
              if (!response.ok) return null;
              return await loadImage(Buffer.from(await response.arrayBuffer()));
            }
            return await loadImage(source);
          } catch {
            return null;
          }
        })(),
      );
    return images.get(source)!;
  };
  const show = data.record?.game_data_show ?? {};
  const medals = (show.medal_item_list ?? []).slice(0, 3);
  const [
    background,
    deadlyBg,
    extremeBg,
    trialBg,
    shiyuBg,
    deco,
    cardArt,
    head,
    gtAssets,
    medalImages,
    stars,
    rankImages,
  ] = await Promise.all([
    image(join(ASSETS, FILES.background)),
    image(join(ASSETS, FILES.deadly)),
    image(join(ASSETS, FILES.extreme)),
    image(join(ASSETS, FILES.trial)),
    image(join(ASSETS, FILES.shiyu)),
    image(join(ASSETS, FILES.deco)),
    image(show.card_url),
    image(data.record?.cur_head_icon_url),
    loadGtCardAssets(),
    Promise.all(medals.map((m: any) => image(m.medal_icon))),
    Promise.all([
      image("src/assets/images/icons/deadly/star_hard.png"),
      image("src/assets/images/icons/deadly/star.png"),
    ]),
    Promise.all(
      [1, 2, 3, 4, 5].map((tier) =>
        image(`src/assets/images/icons/deadly/rankbg-${tier}.png`),
      ),
    ),
  ]);
  const height = layout.height / SCALE;
  ctx.fillStyle = "#222222";
  ctx.fillRect(0, 0, WIDTH, height);
  if (background) {
    const bgHeight = (background.height * WIDTH) / background.width;
    ctx.drawImage(background, 0, 0, WIDTH, bgHeight);
    const fade = ctx.createLinearGradient(0, bgHeight * 0.45, 0, bgHeight);
    fade.addColorStop(0, "#22222200");
    fade.addColorStop(1, "#222222");
    ctx.fillStyle = fade;
    ctx.fillRect(0, bgHeight * 0.45, WIDTH, bgHeight * 0.55);
  }

  // HoYoLAB's beveled account panel, with the four requested compact statistics.
  const panel = ctx.createLinearGradient(0, 24, 0, 294);
  panel.addColorStop(0, "#50514e");
  panel.addColorStop(1, "#30312f");
  box(ctx, 26, 24, 1148, 270, panel, 9, "#161715");
  box(ctx, 40, 37, 1120, 167, "#10110f", 7, "#676862");
  ctx.save();
  clip(ctx, 54, 51, 1092, 139, 7);
  ctx.fillStyle = "#4c4d4a";
  ctx.fillRect(54, 51, 1092, 139);
  if (cardArt) cover(ctx, cardArt, 54, 51, 1092, 139);
  const mask = ctx.createLinearGradient(54, 0, 1146, 0);
  mask.addColorStop(0, "#111111b0");
  mask.addColorStop(0.55, "#11111170");
  mask.addColorStop(1, "#11111130");
  ctx.fillStyle = mask;
  ctx.fillRect(54, 51, 1092, 139);
  ctx.restore();
  ctx.beginPath();
  ctx.roundRect(54, 51, 1092, 139, 7);
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 3;
  ctx.stroke();
  // Thin diagonal edges give the inset the same recessed appearance as the site.
  ctx.strokeStyle = "#65665f";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(41, 38);
  ctx.lineTo(54, 51);
  ctx.moveTo(1159, 38);
  ctx.lineTo(1146, 51);
  ctx.moveTo(41, 203);
  ctx.lineTo(54, 190);
  ctx.moveTo(1159, 203);
  ctx.lineTo(1146, 190);
  ctx.stroke();
  box(ctx, 73, 86, 68, 68, "#191919", 34, "#aaa9a2");
  ctx.save();
  clip(ctx, 76, 89, 62, 62, 31);
  if (head) cover(ctx, head, 76, 89, 62, 62);
  ctx.restore();
  const nameWidth = text(
    ctx,
    data.account.nickname || "—",
    160,
    110,
    25,
    font,
    "#f4f4f4",
    280,
  );
  const levelX = 171 + nameWidth;
  box(ctx, levelX, 91, 49, 23, "#ffe500", 4);
  text(
    ctx,
    `Lv.${data.account.level ?? "—"}`,
    levelX + 24.5,
    107,
    15,
    numFont,
    "#111",
    45,
    "center",
  );
  medals.forEach((medal: any, index: number) => {
    const x = levelX + 69 + index * 43;
    contain(ctx, medalImages[index], x, 77, 37, 42);
    if (medal.number_str || medal.number)
      text(
        ctx,
        medal.number_str || medal.number,
        x + 19,
        116,
        13,
        numFont,
        "#fff",
        35,
        "center",
      );
  });
  let detailsX = 160;
  if (show.personal_title) {
    ctx.font = `17px ${font}`;
    const titleWidth = Math.min(
      300,
      ctx.measureText(show.personal_title).width + 24,
    );
    box(ctx, detailsX, 131, titleWidth, 27, "#0b0b0b", 14);
    const titleColor = /^[0-9a-f]{6}$/i.test(show.title_main_color)
      ? `#${show.title_main_color}`
      : "#ff7777";
    text(
      ctx,
      show.personal_title,
      detailsX + 12,
      150,
      17,
      font,
      titleColor,
      titleWidth - 24,
    );
    detailsX += titleWidth + 18;
  }
  text(
    ctx,
    [data.account.region_name, `UID ${data.account.game_role_id}`]
      .filter(Boolean)
      .join("   |   "),
    detailsX,
    150,
    16,
    font,
    "#e0e0e0",
    1100 - detailsX,
  );
  box(ctx, 54, 218, 1092, 57, "#ffe500", 0);
  const stats = data.record?.stats ?? {};
  const values = [
    ["profileMain_ActiveDays", stats.active_days],
    ["profileMain_Agents", stats.avatar_num],
    ["profileMain_Bangboo", stats.buddy_num],
    ["profileMain_Achievements", stats.achievement_count],
  ];
  for (let i = 0; i < values.length; i++) {
    const x = 54 + 273 * i + 136.5;
    text(
      ctx,
      values[i][1] ?? "—",
      x,
      244,
      25,
      numFont,
      "#161616",
      235,
      "center",
    );
    text(ctx, tr(values[i][0]), x, 266, 14, font, "#161616", 235, "center");
  }

  section(ctx, tr("Agents"), layout.agentsY + 18, font);
  const cards = await Promise.all(
    data.showcase.map(async (agent) => {
      const item: GtCardItem = {
        id: String(agent.id),
        rarity: agent.rarity === "A" ? "A" : agent.rarity === "B" ? "B" : "S",
        elementType: agent.element_type,
        profession: agent.avatar_profession,
      };
      const [art, metadata] = await Promise.all([
        image(agent.role_square_url),
        loadGtCardMetadataImages(item),
      ]);
      return { agent, item, art, ...metadata };
    }),
  );
  if (!cards.length)
    text(
      ctx,
      tr("profileMain_Empty"),
      LEFT,
      layout.agentsY + 51,
      17,
      font,
      "#999",
    );
  const cardW = (INNER - 8 * 12) / 9;
  for (let i = 0; i < cards.length; i++) {
    const { agent, item, art, element, profession } = cards[i];
    const x = LEFT + i * (cardW + 12),
      y = layout.agentsY + 42;
    box(ctx, x, y, cardW, 139, "#090909", 8, "#555650");
    ctx.save();
    clip(ctx, x + 3, y + 3, cardW - 6, 111, 5);
    if (gtAssets.cardPattern)
      ctx.drawImage(gtAssets.cardPattern, x, y, cardW, 115);
    if (art) cover(ctx, art, x + 3, y + 3, cardW - 6, 111);
    ctx.restore();
    contain(ctx, gtAssets.rarity[item.rarity], x + 5, y + 5, 25, 25);
    [element, profession].forEach((icon, j) => {
      box(ctx, x + 6, y + 35 + 25 * j, 22, 22, "#111d", 11);
      contain(ctx, icon, x + 8, y + 37 + 25 * j, 18, 18);
    });
    if (Number(agent.rank) > 0) {
      box(ctx, x + cardW - 26, y + 4, 22, 23, "#111a", 5);
      text(
        ctx,
        agent.rank,
        x + cardW - 15,
        y + 22,
        18,
        numFont,
        "#fff",
        20,
        "center",
      );
    }
    text(
      ctx,
      `Lv. ${agent.level ?? "—"}`,
      x + cardW / 2,
      y + 132,
      17,
      font,
      "#e2e2e2",
      cardW - 8,
      "center",
    );
  }

  const rankBadge = (rank: number | null, x: number, y: number) => {
    const label = formatProfileRank(rank);
    if (!label) return;
    const percent = Number(rank) / 100;
    const tier =
      percent > 20
        ? 4
        : percent > 5
          ? 3
          : percent > 2
            ? 2
            : percent > 1
              ? 1
              : 0;
    if (rankImages[tier]) ctx.drawImage(rankImages[tier]!, x, y, 112, 29);
    else box(ctx, x, y, 103, 28, "#6ddeff", 9);
    text(ctx, label, x + 46, y + 20, 17, font, "#090909", 96, "center");
  };
  const battleScore = (
    battle: ProfileBattleSummary | null,
    status: string,
    x: number,
    y: number,
    width: number,
  ) => {
    if (!battle) {
      text(
        ctx,
        tr(
          status === "unavailable"
            ? "profileMain_Unavailable"
            : "profileMain_Empty",
        ),
        x,
        y,
        19,
        font,
        "#aaa",
        width,
      );
      return;
    }
    const scoreW = text(
      ctx,
      battle.score,
      x,
      y,
      39,
      numFont,
      "#f5f5f5",
      width - 140,
    );
    rankBadge(battle.rank, x + scoreW + 12, y - 31);
  };
  if (layout.deadly.length) {
    section(ctx, tr("DeadlyAssault"), layout.battleY + 18, font);
    for (let i = 0; i < layout.deadly.length; i++) {
      const period = layout.deadly[i],
        y = layout.battleY + 42 + i * 158;
      periodLabel(ctx, period, LEFT, y + 8, tr, font, INNER);
      if (deadlyBg) ctx.drawImage(deadlyBg, LEFT, y + 23, INNER, 116);
      else box(ctx, LEFT, y + 23, INNER, 116, "#171717", 7, "#5a5a5a");
      const colW = (INNER - 40) / 2;
      for (const [index, battle, label, bg] of [
        [0, period.extreme, "profileMain_Extreme", extremeBg],
        [1, period.trial, "profileMain_Trial", trialBg],
      ] as const) {
        const x = LEFT + 15 + index * (colW + 10),
          cardY = y + 48;
        if (bg) ctx.drawImage(bg, x, cardY, colW, 76);
        text(
          ctx,
          tr(label),
          x + 14,
          cardY + 22,
          17,
          font,
          "#d5cfd5",
          colW - 30,
        );
        battleScore(battle, period.status, x + 14, cardY + 61, colW - 100);
        if (battle?.stars !== undefined) {
          contain(ctx, stars[index], x + colW - 83, cardY + 32, 28, 28);
          text(
            ctx,
            `×${battle.stars}`,
            x + colW - 50,
            cardY + 55,
            23,
            numFont,
            "#fff",
            44,
          );
        }
      }
    }
  }
  if (layout.hasShiyu) {
    section(ctx, tr("ShiyuDefense"), layout.shiyuY + 18, font);
    const colW = (INNER - 16) / 2;
    for (const schedule of [1, 2] as const) {
      const period = data.shiyu.find((p) => p.schedule === schedule) ?? {
        schedule,
        status: "empty",
        start: "",
        end: "",
        battle: null,
      };
      const x = LEFT + (schedule - 1) * (colW + 16),
        y = layout.shiyuY + 51;
      periodLabel(ctx, period, x, y, tr, font, colW);
      const cardY = y + 19;
      // Preserve the frame's border widths while fitting the wide site card into half a row.
      if (shiyuBg) ctx.drawImage(shiyuBg, x, cardY, colW, 134);
      else box(ctx, x, cardY, colW, 134, "#290f12", 7, "#5a5a5a");
      if (period.battle) {
        const floor = period.battle.floor;
        const labelW = text(
          ctx,
          floor === undefined ? "—" : tr("profileMain_Frontier", { floor }),
          x + 20,
          cardY + 44,
          18,
          font,
          "#ddd",
          colW - 135,
        );
        if (period.battle.rating) {
          const rating = period.battle.rating;
          const ratingImage = /^(S\+|S|A|B)$/.test(rating)
            ? await image(
                `src/assets/images/icons/shiyu/rating-${rating.toLowerCase().replace("+", "_plus")}.png`,
              )
            : null;
          if (ratingImage)
            contain(ctx, ratingImage, x + 30 + labelW, cardY + 22, 43, 27);
          else
            text(
              ctx,
              rating,
              x + 30 + labelW,
              cardY + 43,
              22,
              numFont,
              "#79d9ff",
              65,
            );
        }
      }
      battleScore(period.battle, period.status, x + 30, cardY + 101, colW - 65);
    }
  }
  if (deco) {
    ctx.globalAlpha = 0.35;
    contain(ctx, deco, WIDTH / 2 - 78, height - 21, 156, 12);
    ctx.globalAlpha = 1;
  }
  return canvas.toBuffer("image/png");
}
