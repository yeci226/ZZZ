/** Local preview using the real Discord message builder. Does not log in or send messages. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer } from "node:http";
import {
  analyticsSource,
  matchReferenceRuns,
} from "../utilities/zzz/analyticsSource.js";
import {
  buildAnalyticsEntry,
  handleAnalyticsReference,
} from "../utilities/zzz/analyticsReference.js";

const directory = resolve("previews/analytics-reference");
await mkdir(directory, { recursive: true });
const snapshot = await analyticsSource.get();
const detailed = snapshot.runs.filter(
  (run) => run.hasLog && run.actors.every((actor) => actor.equipment.slot4),
);
const candidates = detailed.length ? detailed : snapshot.runs;
const example =
  candidates.find((r) => r.actors.some((a) => a.id === "1091")) ??
  candidates[0];
if (!example) throw new Error("No public reference records available");
const agent = example.actors.find((a) => a.id === "1091") ?? example.actors[0];
const examples = matchReferenceRuns(candidates, [agent.id]).slice(0, 3);
// Limit only this preview process to three real records so every button can be
// pre-rendered. Account ownership and mindscapes below are illustrative.
analyticsSource.get = async () => ({ ...snapshot, runs: examples });
const names = JSON.parse(
  await readFile("src/assets/disc-leaderboard-names.json", "utf8"),
);
const roster = examples[0].actors.map((a) => ({
  id: a.id,
  name: names.tw?.[a.id]?.name ?? a.name,
  rank: 0,
}));
const serialize = (rows: any[]) => rows.map((r) => r.toJSON());
const home = serialize(buildAnalyticsEntry("preview", "tw", [], roster));
const character = serialize(
  buildAnalyticsEntry("preview", "tw", [{ id: agent.id }], roster),
);
const pages: Record<string, unknown> = {};
for (const entry of [...home, ...character].flatMap((r) => r.components)) {
  for (const mode of ["teams", "gear", "damage"]) {
    for (const filter of ["all", "owned"]) {
      for (let page = 0; page < examples.length; page++) {
        for (const action of ["open", "view", "export"]) {
          const id = entry.custom_id.replace(
            /:(open|view|export):\w+:\w+:\d+$/,
            `:${action}:${mode}:${filter}:${page}`,
          );
          if (pages[id]) continue;
          await handleAnalyticsReference({
            customId: id,
            user: { id: "preview" },
            locale: "zh-TW",
            deferReply: async () => {},
            deferUpdate: async () => {},
            reply: async (data: unknown) => {
              pages[id] = data;
            },
            followUp: async (data: unknown) => {
              pages[id] = data;
            },
            editReply: async (data: any) => {
              pages[id] = {
                content: data.content,
                embeds: data.embeds?.map((e: any) => e.toJSON()),
                components: data.components ? serialize(data.components) : [],
                download: data.files?.[0]
                  ? {
                      name: data.files[0].name,
                      text: data.files[0].attachment.toString(),
                    }
                  : undefined,
              };
            },
          } as any);
        }
      }
    }
  }
}
const data = {
  home,
  character,
  pages,
  agent: roster.find((a) => a.id === agent.id)?.name ?? agent.name,
  roster: roster.map((a) => a.name).join("、"),
};
await writeFile(
  resolve(directory, "payloads.json"),
  JSON.stringify(data, null, 2),
);
const html = `<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>柯琳小助手 · 參考資料預覽</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#1e1f22;color:#dbdee1;font:14px/1.6 "Segoe UI","Microsoft JhengHei",sans-serif}header{padding:18px 28px;border-bottom:1px solid #41434a;background:#2b2d31}h1{font-size:18px;margin:0;color:#f2f3f5}header p{margin:5px 0 0;color:#b5bac1;font-size:12px}.layout{max-width:1220px;margin:0 auto;display:grid;grid-template-columns:310px 1fr;min-height:calc(100vh - 100px)}aside{padding:24px 20px;border-right:1px solid #41434a;background:#232428}aside h2{font-size:14px;margin:0 0 10px;color:#f2f3f5}aside p{color:#b5bac1;font-size:12px}section+section{margin-top:28px}.context{background:#2b2d31;border:1px dashed #555760;border-radius:6px;padding:18px;color:#b5bac1;margin-bottom:12px;font-size:12px}.message{padding:26px 24px;background:#313338;min-width:0}.author{font-weight:600;color:#fff;display:flex;align-items:center;gap:8px;margin-bottom:12px}.app{font-size:10px;background:#5865f2;border-radius:3px;padding:0 5px}.time{font-weight:400;color:#949ba4;font-size:12px}.embed{border-left:4px solid #68d4ba;background:#2b2d31;border-radius:4px;padding:16px;max-width:560px;overflow-wrap:anywhere}.title{font-weight:700;color:#00a8fc;font-size:16px;text-decoration:none}.desc{white-space:pre-wrap;margin:8px 0 15px}.field{margin-top:15px}.field b{color:#f2f3f5}.value{white-space:pre-wrap;line-height:1.55}.footer{font-size:11px;color:#b5bac1;margin-top:18px}.row{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}button,.button{display:inline-block;text-decoration:none;background:#4e5058;color:#fff;border:0;border-radius:4px;padding:7px 12px;font:500 13px/1.5 "Segoe UI","Microsoft JhengHei",sans-serif;cursor:pointer}button:hover,.button:hover{background:#6d6f78}button:disabled{opacity:.4;cursor:default}.private{font-size:12px;color:#a3a6aa;margin-top:12px}.private span{color:#00a8fc}.hint{font-size:12px;color:#b5bac1;margin-top:20px;max-width:560px}@media(max-width:760px){.layout{display:block}aside{border-right:0;border-bottom:1px solid #41434a;padding:18px}.message{padding:18px}.embed{max-width:none}section+section{margin-top:18px}}
</style><header><h1>柯琳小助手 · 外部參考資料</h1><p>本機互動預覽 · 使用實際 Discord 訊息資料重建，非 Discord 截圖 · 不發送訊息</p></header><div class="layout"><aside><section><h2>① /profile 主頁</h2><div class="context">原有個人簡介圖片與角色選單<br>此處省略，僅展示新增入口</div><div id="home"></div></section><section><h2>② 選擇角色後</h2><div class="context" id="character-context"></div><div id="character"></div></section><p id="sample"></p></aside><main class="message"><div class="author">柯琳小助手 <span class="app">APP</span><span class="time">預覽</span></div><div id="result"></div><p class="private">僅你可見 · <span>關閉訊息</span></p><p class="hint">可切換隊伍／配裝／傷害分析、翻頁及篩選持有角色。預覽只載入 3 筆真實來源紀錄；示例持有角色及 M0 為展示設定，非你的帳號資料。影片與日誌按鈕會開啟來源網站。</p></main></div>
<script type="application/json" id="data">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>
<script>
const data=JSON.parse(document.querySelector('#data').textContent);
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const md=s=>escape(s).replace(/\\\\([_*~\x60|>])/g,'$1').replace(/[*][*](.*?)[*][*]/g,'<strong>$1</strong>');
function controls(rows){return (rows??[]).map(r=>'<div class="row">'+r.components.map(c=>c.url?'<a class="button" href="'+escape(c.url)+'" target="_blank" rel="noopener">'+escape(c.label)+' ↗</a>':'<button data-id="'+escape(c.custom_id)+'" '+(c.disabled?'disabled':'')+'>'+escape(c.label)+'</button>').join('')+'</div>').join('')}
function show(id){const p=data.pages[id];if(!p)return;if(p.download){const a=document.createElement('a');const u=URL.createObjectURL(new Blob([p.download.text],{type:'application/json'}));a.href=u;a.download=p.download.name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);return}document.querySelector('#result').innerHTML=(p.content?'<p>'+escape(p.content)+'</p>':'')+(p.embeds??[]).map(e=>'<div class="embed"><a class="title" href="'+escape(e.url)+'" target="_blank" rel="noopener">'+escape(e.title)+'</a><div class="desc">'+md(e.description)+'</div>'+(e.fields??[]).map(f=>'<div class="field"><b>'+md(f.name)+'</b><div class="value">'+md(f.value)+'</div></div>').join('')+'<div class="footer">'+escape(e.footer?.text)+'</div></div>').join('')+controls(p.components)}
document.querySelector('#home').innerHTML=controls(data.home);document.querySelector('#character').innerHTML=controls(data.character);document.querySelector('#character-context').textContent=data.agent+' · 原有角色圖片下方新增按鈕';document.querySelector('#sample').textContent='示例持有角色：'+data.roster+'（均 M0）';document.addEventListener('click',e=>{const b=e.target.closest('button[data-id]');if(b&&!b.disabled)show(b.dataset.id)});show(data.character[0].components[0].custom_id);
</script></html>`;
await writeFile(resolve(directory, "index.html"), html);
console.log(`Preview: ${directory}`);
if (process.argv.includes("--serve")) {
  createServer((_request, response) => {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(html);
  }).listen(8766, "127.0.0.1", () => console.log("http://127.0.0.1:8766"));
}
