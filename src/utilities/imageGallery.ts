import { readFile, writeFile, mkdir, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

export interface GalleryEntry { pathname: string; bytes: number; sha256: string; type: string; thumbnail?: string; label?: string }
export interface GalleryIndex { schemaVersion: 1; updatedAt: string; entries: GalleryEntry[] }
const extensions = /\.(png|jpe?g|gif|webp|svg|avif)$/i;
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
export function safeGalleryPath(value: string) {
  const decoded = decodeURIComponent(value);
  if (!decoded.startsWith("/") || /[\\\x00-\x1f]/.test(decoded) || decoded.split("/").some(p => p === "." || p === "..")) throw new Error("Invalid gallery path");
  return decoded;
}
export function galleryLabel(name: string) {
  const match = /^ten-s(\d+)-a(\d+)-b(\d+)$/.exec(name);
  return match ? `十抽・${+match[1]}S／${+match[2]}A／${+match[3]}B` : /^single-[sab]$/.test(name) ? `單抽・${name.slice(-1).toUpperCase()}` : name;
}
const script = String.raw`
const data=JSON.parse(document.getElementById('data').textContent),grid=document.querySelector('main'),q=document.querySelector('#q'),sort=document.querySelector('#sort'),pager=document.querySelector('#pager');let page=0;
const human=n=>n>=1048576?(n/1048576).toFixed(2)+' MB':Math.ceil(n/1024)+' KB';
function draw(){let list=data.filter(x=>(x.name+' '+(x.label||'')).toLowerCase().includes(q.value.toLowerCase()));list.sort((a,b)=>Number(!!b.folder)-Number(!!a.folder)||(sort.value==='size'?b.bytes-a.bytes:sort.value==='type'?(a.type||'').localeCompare(b.type||''):0)||a.name.localeCompare(b.name, 'zh-Hant',{numeric:true}));let pages=Math.max(1,Math.ceil(list.length/48));page=Math.min(page,pages-1);grid.replaceChildren();for(const x of list.slice(page*48,page*48+48)){let card=document.createElement('a');card.className='card';card.href=x.url;let visual=document.createElement('div');visual.className='visual';if(x.folder)visual.textContent='📁';else if(x.type==='gif'&&!x.thumbnail)visual.textContent='▶ GIF';else{let img=document.createElement('img');img.src=x.thumbnail||x.url;img.alt=x.label||x.name;img.loading='lazy';visual.append(img);}let title=document.createElement('strong');title.textContent=x.label||x.name;let info=document.createElement('small');info.textContent=x.folder?x.count+' 個檔案':(x.type||'').toUpperCase()+' · '+human(x.bytes);card.append(visual,title,info);if(!x.folder)card.addEventListener('click',e=>{e.preventDefault();preview(x)});grid.append(card);}document.querySelector('#position').textContent=(page+1)+' / '+pages+' 頁 · '+list.length+' 個項目';document.querySelector('#prev').disabled=page===0;document.querySelector('#next').disabled=page+1===pages;}
q.oninput=()=>{page=0;draw()};sort.onchange=()=>{page=0;draw()};document.querySelector('#prev').onclick=()=>{page--;draw()};document.querySelector('#next').onclick=()=>{page++;draw()};
const modal=document.querySelector('dialog'),pic=document.querySelector('#preview'),original=document.querySelector('#original');let selected;
function preview(x){selected=x;document.querySelector('#filename').textContent=x.name;pic.src=x.url;pic.alt=x.label||x.name;original.href=x.url;document.querySelector('#replay').hidden=x.type!=='gif';modal.showModal();}
document.querySelector('#close').onclick=()=>modal.close();modal.onclose=()=>{pic.removeAttribute('src')};document.querySelector('#replay').onclick=()=>{pic.src=selected.url+'?preview='+Date.now()};document.querySelector('#copy').onclick=async()=>{try{await navigator.clipboard.writeText(new URL(selected.url,location.origin).href);document.querySelector('#copy').textContent='已複製';setTimeout(()=>document.querySelector('#copy').textContent='複製網址',1200)}catch{document.querySelector('#copy').textContent='請從「原始檔案」複製連結'}};draw();
`;
export async function buildImageGallery(directory: string, metadata: Partial<Record<string, Partial<GalleryEntry>>> = {}): Promise<GalleryIndex> {
  const entries: GalleryEntry[] = [], folders = new Set(["/"]);
  async function scan(relative = "") {
    for (const file of await readdir(path.join(directory, relative), { withFileTypes: true })) {
      if (file.name.startsWith(".") || file.name === "_gallery") continue;
      const sub = path.posix.join(relative, file.name);
      if (file.isDirectory()) { folders.add("/" + sub + "/"); await scan(sub); }
      else if (file.isFile() && extensions.test(file.name)) {
        const pathname = "/" + sub.split("/").map(encodeURIComponent).join("/");
        const bytes = await readFile(path.join(directory, sub));
        entries.push({ pathname, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), type: path.extname(sub).slice(1).toLowerCase(), ...metadata[pathname] });
      }
    }
  }
  await scan();
  entries.sort((a, b) => a.pathname.localeCompare(b.pathname));
  const index: GalleryIndex = { schemaVersion: 1, updatedAt: new Date().toISOString(), entries };
  await writeFile(path.join(directory, "gallery-index.json"), JSON.stringify(index, null, 2) + "\n");
  for (const folder of folders) {
    const direct = entries.filter(e => path.posix.dirname(safeGalleryPath(e.pathname)) + "/" === folder || (folder === "/" && path.posix.dirname(safeGalleryPath(e.pathname)) === "/"));
    const children = [...folders].filter(f => f !== folder && path.posix.dirname(f.slice(0, -1)) + "/" === folder || (folder === "/" && f !== "/" && path.posix.dirname(f.slice(0, -1)) === "/"));
    const data = [
      ...children.map(f => ({ name: path.posix.basename(f), label: galleryLabel(path.posix.basename(f)), url: f.split("/").map(encodeURIComponent).join("/"), folder: true, count: entries.filter(e => safeGalleryPath(e.pathname).startsWith(f)).length, bytes: 0 })),
      ...direct.map(e => ({ ...e, url: e.pathname, name: path.posix.basename(safeGalleryPath(e.pathname)) })),
    ];
    const crumbs = folder.split("/").filter(Boolean), links = ['<a href="/">首頁</a>'];
    for (let i = 0; i < crumbs.length; i++) links.push(`<a href="/${crumbs.slice(0, i + 1).map(encodeURIComponent).join("/")}/">${escapeHtml(galleryLabel(crumbs[i]))}</a>`);
    const html = `<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(folder)} · img.yeci.it.com</title>
<style>:root{color-scheme:dark}*{box-sizing:border-box}body{max-width:1200px;margin:auto;padding:24px;background:#0b1020;color:#edf2f7;font:16px/1.6 system-ui}a{color:#93c5fd}nav{overflow-wrap:anywhere}h1{margin-bottom:0}.muted,small{color:#a8b7cc}input,select,button,.button{padding:10px 14px;border-radius:8px;border:1px solid #34435b;background:#182237;color:#fff;font:inherit}button,a{cursor:pointer}button:disabled{opacity:.4;cursor:default}.tools{display:flex;flex-wrap:wrap;gap:12px;margin:24px 0}.tools input{flex:1;min-width:180px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:16px}.card{display:flex;flex-direction:column;overflow:hidden;border:1px solid #29374d;border-radius:12px;background:#121c2e;text-decoration:none;color:#fff}.card:hover{border-color:#7bb6ff}.visual{aspect-ratio:16/9;display:grid;place-items:center;background:#080d18;font-size:38px}.visual img{width:100%;height:100%;object-fit:contain}.card strong,.card small{padding:8px 12px;overflow-wrap:anywhere}.card small{padding-top:0}#pager{display:flex;gap:14px;align-items:center;justify-content:center;margin:24px 0}dialog{max-width:min(96vw,1150px);max-height:96vh;background:#101a2b;color:#fff;border:1px solid #536079;border-radius:12px}dialog::backdrop{background:#000b}#preview{display:block;max-width:100%;max-height:70vh;margin:auto}#filename{overflow-wrap:anywhere}dialog .tools{margin:12px 0}@media(max-width:520px){body{padding:16px}.grid{grid-template-columns:repeat(2,minmax(0,1fr))}.card strong{font-size:13px}}</style>
<nav>${links.join(" ／ ")}</nav><h1>${escapeHtml(folder === "/" ? "圖片與動畫圖庫" : galleryLabel(crumbs.at(-1)!))}</h1><p class="muted">${children.length} 個資料夾 · ${direct.length} 個檔案。點選圖片或 GIF 預覽。</p>${folder === "/" ? "" : `<a href="${crumbs.length > 1 ? "/" + crumbs.slice(0, -1).map(encodeURIComponent).join("/") + "/" : "/"}">← 返回上層</a>`}
<div class="tools"><input id="q" aria-label="搜尋此資料夾" placeholder="搜尋此資料夾的名稱"><select id="sort" aria-label="排序"><option value="name">名稱</option><option value="type">類型</option><option value="size">大小</option></select></div><main class="grid"></main><div id="pager"><button id="prev">上一頁</button><span id="position"></span><button id="next">下一頁</button></div>
<dialog><strong id="filename"></strong><img id="preview"><div class="tools"><button id="replay">重新播放</button><a id="original" class="button" target="_blank" rel="noopener">原始檔案</a><button id="copy">複製網址</button><button id="close">關閉</button></div></dialog><script id="data" type="application/json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script><script>${script}</script></html>`;
    await mkdir(path.join(directory, folder), { recursive: true });
    await writeFile(path.join(directory, folder, "index.html"), html);
  }
  return index;
}
