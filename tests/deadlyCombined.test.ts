import { createCanvas, loadImage } from "@napi-rs/canvas";
import {
  DEADLY_COMBINED_SIZE,
  drawDeadlyCombinedImage,
  getDeadlyRankFromAbstract,
  layoutRichTextLines,
} from "../src/utilities/zzz/deadlyCombined.js";

const tr = (key: string, args: Record<string, unknown> = {}) => {
  if (key === "DeadlyAssault_Period") return `危局強襲戰・第 ${args.period} 期`;
  return "";
};

const battle = (name: string, score: number) => ({
  score,
  star: 3,
  challenge_time: {
    year: 2026,
    month: 7,
    day: 31,
    hour: 19,
    minute: 26,
    second: 8,
  },
  boss: [{ name, icon: "", bg_icon: "", weak_element_type: [2, 3] }],
  buffer: [{ name: "戰場增益", desc: "測試增益效果" }],
  avatar_list: [],
  buddy: {},
});

const payload = {
  has_data: true,
  zone_id: 105,
  start_time: { year: 2026, month: 7, day: 18 },
  end_time: { year: 2026, month: 8, day: 1 },
  total_score: 181000,
  total_star: 9,
  list: [
    battle("一般首領甲", 43000),
    battle("一般首領乙", 44000),
    battle("一般首領丙", 45000),
  ],
  has_hard: true,
  hard_list: [battle("絕境大首領", 49000)],
};

async function samplePixel(buffer: Buffer, x: number, y: number) {
  const image = await loadImage(buffer);
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0);
  return Array.from(ctx.getImageData(x, y, 1, 1).data);
}

describe("危局強襲戰絕境置頂長條版面", () => {
  it("增益換行時會把數字與百分號視為不可分割單位", () => {
    const canvas = createCanvas(400, 100);
    const ctx = canvas.getContext("2d");
    ctx.font = "18px sans-serif";
    const maxWidth = ctx.measureText("傷害提升12.5").width + 1;
    const lines = layoutRichTextLines(
      ctx,
      "傷害提升<color=#73E6A2>12.5%</color>",
      maxWidth,
      3,
      "#FFFFFF",
    ).map((line) => line.map((token) => token.char).join(""));

    expect(lines.join("")).toBe("傷害提升12.5%");
    expect(lines.some((line) => line === "%" || line.startsWith("%"))).toBe(
      false,
    );
    expect(lines.some((line) => line.includes("12.5%"))).toBe(true);
  });

  it("從 hadal_mem_abstract_info 依模式讀取原始排名值", () => {
    const abstract = {
      list: [
        { nest_type: "General", rank: 573 },
        { nest_type: "Extreme", rank: 2091 },
      ],
    };
    expect(getDeadlyRankFromAbstract(abstract, "normal")).toBe(573);
    expect(getDeadlyRankFromAbstract(abstract, "extreme")).toBe(2091);
    expect(
      getDeadlyRankFromAbstract(
        {
          list: [
            { nest_type: 1, rank: 327 },
            { nest_type: 2, rank: 1946 },
          ],
        },
        "normal",
      ),
    ).toBe(327);
    expect(
      getDeadlyRankFromAbstract(
        {
          list: [
            { nest_type: 1, rank: 327 },
            { nest_type: 2, rank: 1946 },
          ],
        },
        "extreme",
      ),
    ).toBe(1946);
  });

  it("使用 HoYoLAB 官方 72×72 絕境紅星素材", async () => {
    const hardStar = await loadImage(
      "./src/assets/images/icons/deadly/star_hard.png",
    );
    expect(hardStar.width).toBe(72);
    expect(hardStar.height).toBe(72);
  });

  it("固定輸出絕境置頂、三關試煉長條所需的 1200×1440 畫布", async () => {
    const buffer = await drawDeadlyCombinedImage(tr, "tw", payload);
    const image = await loadImage(buffer);

    expect(image.width).toBe(DEADLY_COMBINED_SIZE.width);
    expect(image.height).toBe(DEADLY_COMBINED_SIZE.height);
    expect(DEADLY_COMBINED_SIZE).toEqual({ width: 1200, height: 1440 });
    expect(buffer.length).toBeGreaterThan(20_000);
  });

  it("一般與絕境區域都有實際像素內容，沒有退化成透明區塊", async () => {
    const buffer = await drawDeadlyCombinedImage(tr, "tw", payload);
    const extremePixel = await samplePixel(buffer, 70, 190);
    const normalPixel = await samplePixel(buffer, 70, 690);

    expect(normalPixel[3]).toBe(255);
    expect(extremePixel[3]).toBe(255);
    expect(normalPixel.slice(0, 3)).not.toEqual(extremePixel.slice(0, 3));
  });

  it("沒有 hard_list 時仍安全輸出頂部無紀錄狀態", async () => {
    const buffer = await drawDeadlyCombinedImage(tr, "tw", {
      ...payload,
      has_hard: false,
      hard_list: [],
    });
    const image = await loadImage(buffer);

    expect(image.width).toBe(1200);
    expect(image.height).toBe(1440);
  });
});
