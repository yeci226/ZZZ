/** Offline Discord-style screenshot source. Never logs in to Discord or sends a message. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import {
  buildLiveDamageMessage,
  createLiveDamageSession,
} from "../utilities/zzz/combat/liveDamageDiscord.js";

const input = process.argv[2];
if (!input)
  throw new Error(
    "Usage: tsx src/scripts/previewCombatDiscord.ts <live-snapshot.json> [output-directory]",
  );
const raw = JSON.parse(await readFile(resolve(input), "utf8"));
const directory = resolve(process.argv[3] ?? "previews/combat");
await mkdir(directory, { recursive: true });
const state = createLiveDamageSession("offline-preview", raw.team ?? raw);
const escape = (v: unknown) =>
  String(v).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const avatar = `data:image/webp;base64,${(await readFile(resolve("src/assets/images/icons/roleCircle/1061.webp"))).toString("base64")}`;

for (const mode of ["single", "team"] as const) {
  if (mode === "team") {
    // Explicit example counts, using the user's actual builds. This is not a validated combat rotation.
    state.entries = [
      {
        actor: "1171",
        attack: "afterburn",
        count: 1,
        conditions: { ...state.conditions },
      },
      {
        actor: "1401",
        attack: "assault",
        count: 2,
        conditions: { ...state.conditions },
      },
      {
        actor: "1581",
        attack: "skill-0-0",
        count: 1,
        conditions: { ...state.conditions },
      },
    ];
    state.totalView = true;
  }
  const message = await buildLiveDamageMessage(state);
  const png = message.files[0].attachment as Buffer;
  await writeFile(join(directory, `discord-damage-${mode}.png`), png);
  const embed = message.embeds[0].toJSON();
  const components = message.components.map((r) => r.toJSON());
  const controls = components
    .map(
      (r) =>
        `<div class="row">${r.components
          .map((component) => {
            if (component.type === 3) {
              const selected = component.options.filter((o) => o.default);
              const value = selected.length
                ? selected.map((o) => o.label).join("、")
                : component.placeholder;
              return `<div class="select"><span>${escape(value)}</span><b>⌄</b></div>`;
            }
            if (component.type === 2)
              return `<button class="${component.style === 1 ? "primary" : component.style === 3 ? "success" : ""}" ${component.disabled ? "disabled" : ""}>${escape("label" in component ? component.label : "")}</button>`;
            return "";
          })
          .join("")}</div>`,
    )
    .join("");
  const html = `<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>柯琳小助手 · 傷害試算訊息預覽</title>
  <style>
  *{box-sizing:border-box}body{margin:0;background:#202127;color:#f0f1f5;font:15px -apple-system,BlinkMacSystemFont,"PingFang TC",sans-serif}.app{max-width:1120px;margin:auto;background:#313338;min-height:100vh}.top{height:62px;border-bottom:1px solid #22242a;display:flex;align-items:center;padding:0 28px;gap:14px;box-shadow:0 1px 4px #0002}.hash{color:#9297a4;font-size:28px}.channel{font-weight:650}.note{margin-left:auto;color:#a6aab5;font-size:12px}.message{display:flex;gap:16px;padding:28px}.avatar{width:44px;height:44px;border-radius:50%;background:#202127}.body{min-width:0;max-width:782px;flex:1}.author{display:flex;gap:8px;align-items:center;margin:1px 0 8px;font-size:16px;font-weight:600}.bot{background:#5865f2;border-radius:3px;font-size:10px;padding:2px 5px;color:white}.time{font-weight:400;color:#969ba6;font-size:12px;margin-left:3px}.intro{margin:0 0 12px;color:#dcdee5;line-height:1.5}.embed{border-left:4px solid #ffc568;background:#2b2d31;border-radius:4px;padding:15px 15px 10px}.title{font-weight:700;margin-bottom:8px;font-size:16px}.description{font-size:13px;line-height:1.6;color:#d1d4dd;margin-bottom:13px}.card{display:block;width:100%;border-radius:3px}.footer{font-size:11px;color:#aaafbb;margin-top:11px;line-height:1.5}.controls{padding-top:10px;max-width:100%}.row{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px}.select{background:#1e1f22;border:1px solid #18191c;border-radius:4px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 13px;width:100%;min-height:40px;font-size:14px;color:#e1e3e8}.select span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.select b{font-size:18px;color:#bbbfc9;font-weight:400}button{background:#4e5058;color:#f0f0f3;border:0;border-radius:4px;padding:9px 15px;font:500 13px -apple-system,BlinkMacSystemFont,"PingFang TC",sans-serif;white-space:nowrap}button.primary{background:#5865f2}button.success{background:#248046}button:disabled{opacity:.45}.private{font-size:12px;color:#a5a9b5;margin-top:12px}.private span{color:#909fff}.context{padding:13px 28px;border-bottom:1px solid #ffffff09;color:#b8bdca;font-size:12px}@media(max-width:600px){.top{padding:0 12px}.message{padding:18px 10px;gap:8px}.avatar{width:30px;height:30px}.embed{padding:10px 8px 8px}.intro{font-size:13px}.author{font-size:14px}.note{font-size:10px}.context{padding:12px}.description{font-size:12px}.row{gap:5px}button{font-size:12px;padding:8px 10px}}
  </style><body><main class="app"><header class="top"><span class="hash">#</span><span class="channel">隊伍傷害試算</span><span class="note">Discord 訊息預覽 · 本機截圖</span></header>
  <div class="context">${mode === "single" ? "Yeci 的實際角色與配裝 · 自訂中性目標 · 餘燼 1 次" : "Yeci 的實際配裝 · 示範次數：餘燼 ×1、強擊 ×2、蕾米埃爾普攻第一段 ×1"}</div>
  <article class="message"><img class="avatar" src="${avatar}"><div class="body"><div class="author">柯琳小助手 <span class="bot">APP</span><span class="time">今天</span></div>
  <p class="intro">${mode === "single" ? "已載入蕾米埃爾、愛麗絲與柏妮思的配裝。" : "這是手動指定次數的隊伍合計範例，並非實戰循環。"}</p>
  <div class="embed"><div class="title">${escape(embed.title)}</div><div class="description">${escape(embed.description).replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")}</div>
  <img class="card" src="data:image/png;base64,${png.toString("base64")}"><div class="footer">${escape(embed.footer?.text)}</div></div>
  <div class="controls">${controls}</div><div class="private">僅你可見 · <span>關閉訊息</span></div></div></article></main></body></html>`;
  await writeFile(join(directory, `discord-damage-${mode}.html`), html);
  await writeFile(
    join(directory, `discord-damage-${mode}-payload.json`),
    JSON.stringify(
      { embeds: [embed], components, attachment: `discord-damage-${mode}.png` },
      null,
      2,
    ),
  );
}
console.log(`Discord message previews: ${directory}`);
