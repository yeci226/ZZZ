import { cardCanvas, picture, words, SIM_COLORS } from "./gachaSimulationVisuals.js";
export interface ChartSeries { label: string; color: string; icon?: string; points: Array<{ x: number; y: number }> }
export async function renderSimulationChart(input: { title: string; subtitle: string; series: ChartSeries[]; bars?: boolean; percent?: boolean; xLabel?: string; labels?: Record<number, string>; featured?: string }): Promise<Buffer> {
  const { canvas, ctx } = cardCanvas(630, input.title, input.subtitle);
  if (input.featured) await picture(ctx, input.featured, 894, 19, 79);
  const left = 92, right = 961, top = 187, bottom = 525;
  const points = input.series.flatMap(s => s.points).filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
  const maxX = points.reduce((max, p) => Math.max(max, p.x), 1), rawMax = points.reduce((max, p) => Math.max(max, p.y), 1);
  const tickBase = Math.pow(10, Math.floor(Math.log10(rawMax / 4)));
  const tick = Math.max(1, Math.ceil(rawMax / 4 / tickBase) * tickBase);
  const maxY = input.percent ? 1 : tick * 4;
  const x = (v: number) => left + (input.bars ? (.035 + .93 * v / maxX) : v / maxX) * (right - left), y = (v: number) => bottom - v / maxY * (bottom - top);
  for (let i = 0; i <= 4; i++) {
    const value = maxY * i / 4, yy = y(value);
    ctx.strokeStyle = "#3a3b43"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(left, yy); ctx.lineTo(right, yy); ctx.stroke();
    ctx.fillStyle = SIM_COLORS.muted; ctx.font = "23px SimBody"; ctx.textAlign = "right"; ctx.fillText(input.percent ? `${Math.round(value * 100)}%` : Number(value.toFixed(1)).toString(), left - 14, yy + 8);
  }
  if (!input.labels) for (const value of new Set(Array.from({length: 6}, (_, i) => Math.round(maxX * i / 5)))) { ctx.textAlign = "center"; ctx.fillText(String(value), x(value), bottom + 34); }
  for (const [index, s] of input.series.entries()) {
    const legendX = 34 + index * 310;
    if (s.icon) await picture(ctx, s.icon, legendX, 120, 45);
    else { ctx.fillStyle = s.color; ctx.fillRect(legendX + 2, 134, 24, 12); }
    words(ctx, s.label, legendX + (s.icon ? 55 : 36), 150, 23, s.color, 256);
    ctx.strokeStyle = s.color; ctx.fillStyle = s.color; ctx.lineWidth = 4;
    const finite = s.points.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
    if (input.bars) {
      const width = Math.min(28, (right - left) / Math.max(3, finite.length + 1) * .6 / input.series.length);
      for (const p of finite) ctx.fillRect(Math.max(left, Math.min(right - width, x(p.x) + (index - (input.series.length - 1) / 2) * width - width / 2)), y(p.y), width, bottom - y(p.y));
    } else {
      ctx.beginPath(); finite.forEach((p, i) => { if (i === 0) ctx.moveTo(x(p.x), y(p.y)); else ctx.lineTo(x(p.x), y(p.y)); }); ctx.stroke();
      if (finite.length) { const end = finite.at(-1)!; ctx.beginPath(); ctx.arc(x(end.x), y(end.y), 5, 0, Math.PI * 2); ctx.fill(); }
    }
  }
  if (input.labels) { ctx.fillStyle = SIM_COLORS.ink; ctx.textAlign = "center"; ctx.font = "21px SimBody"; for (const [key, label] of Object.entries(input.labels)) ctx.fillText(label.length > 7 ? label.slice(0, 6) + "…" : label, x(Number(key)), bottom + 34); }
  if (!points.length) words(ctx, "還沒有紀錄，抽卡後就能看到這張圖。", 210, 365, 29, SIM_COLORS.muted, 728);
  words(ctx, `橫軸：${input.xLabel || "抽數"}    縱軸：${input.percent ? "機率／比例" : "出現次數"}`, 92, 606, 24, SIM_COLORS.muted, 860);
  return canvas.encode("png");
}
