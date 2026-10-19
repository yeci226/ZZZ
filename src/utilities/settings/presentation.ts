import { createCanvas, GlobalFonts, loadImage, type Image } from "@napi-rs/canvas";
import { existsSync } from "node:fs";
import path from "node:path";

export const locales = ["en", "tw", "cn", "jp", "kr", "fr", "vi"] as const;
export type UiLocale = typeof locales[number];
export function uiLocale(value: unknown): UiLocale {
  const v = String(value || "en").toLowerCase();
  const aliases: Record<string, UiLocale> = { "zh-tw": "tw", "zh-cn": "cn", ja: "jp", "ja-jp": "jp", ko: "kr", "ko-kr": "kr" };
  return aliases[v] || (locales.includes(v as UiLocale) ? v as UiLocale : locales.find(l => v.startsWith(l + "-"))) || "en";
}
export const apiLocale: Record<UiLocale, string> = { en: "en-us", tw: "zh-tw", cn: "zh-cn", jp: "ja-jp", kr: "ko-kr", fr: "fr-fr", vi: "vi-vn" };
export const numberLocale: Record<UiLocale, string> = { en: "en-US", tw: "zh-TW", cn: "zh-CN", jp: "ja-JP", kr: "ko-KR", fr: "fr-FR", vi: "vi-VN" };
// Ordered as locales above. Keep all new controls usable in every bot language.
const labels = {
  homeGuide: ["Choose an item to edit → select an option → Save. Each item is saved separately; Done closes this panel.", "選擇要修改的項目 → 調整選項 → 按「儲存」。每項分別儲存；「完成」只會關閉面板。", "选择要修改的项目 → 调整选项 → 按「保存」。每项分别保存；「完成」只关闭面板。", "項目を選択 → 内容を変更 → 保存。項目ごとに保存します。「完了」は画面を閉じます。", "항목 선택 → 옵션 변경 → 저장. 항목별로 저장되며 완료는 화면을 닫습니다.", "Choisissez un réglage → modifiez-le → Enregistrer. Chaque réglage est enregistré séparément. Terminer ferme le panneau.", "Chọn mục → đổi lựa chọn → Lưu. Lưu riêng từng mục; Xong chỉ đóng bảng."],
  editGuide: ["Use the controls below, then Save to apply this item. Cancel discards only this item's unsaved changes.", "請操作下方選單或按鈕，再按「儲存」套用此項設定。「取消」只放棄這一項尚未儲存的修改。", "请操作下方菜单或按钮，再按「保存」应用此项设置。「取消」只放弃这一项尚未保存的修改。", "下の操作欄で変更し、保存で適用します。キャンセルはこの項目の未保存の変更だけを破棄します。", "아래에서 변경한 뒤 저장하세요. 취소하면 이 항목의 저장하지 않은 변경만 버립니다.", "Modifiez avec les commandes ci-dessous, puis enregistrez. Annuler abandonne uniquement les modifications non enregistrées de ce réglage.", "Dùng điều khiển bên dưới rồi Lưu. Hủy chỉ bỏ thay đổi chưa lưu của mục này."],
  currentValue: ["Current setting", "目前設定", "当前设置", "現在の設定", "현재 설정", "Réglage actuel", "Cài đặt hiện tại"],
  selectedValue: ["Selected", "已選取", "已选择", "選択中", "선택됨", "Sélectionné", "Đã chọn"],
  unselectedValue: ["Not selected", "未選取", "未选择", "未選択", "선택 안 됨", "Non sélectionné", "Chưa chọn"],
  imageGuide: ["Selection summary · use the menu and buttons below to change it", "選項摘要圖｜請用圖片下方的選單與按鈕修改", "选项摘要图｜请用图片下方的菜单与按钮修改", "選択内容の概要｜変更は画像の下の操作欄から", "선택 요약｜변경은 이미지 아래 메뉴와 버튼에서", "Résumé des choix · utilisez les commandes sous l’image", "Tóm tắt lựa chọn · đổi bằng điều khiển bên dưới ảnh"],
  emptySelection: ["Nothing selected yet", "尚未選取任何項目", "尚未选择任何项目", "項目が選択されていません", "선택한 항목 없음", "Aucun choix pour le moment", "Chưa chọn mục nào"],
  priorityLabel: ["Priority", "兌換順位", "兑换顺序", "交換優先順位", "교환 우선순위", "Priorité", "Thứ tự ưu tiên"],
  standardArt: ["Use the standard character illustration.", "使用角色的標準立繪。", "使用角色的标准立绘。", "通常のキャラクターイラストを使用します。", "기본 캐릭터 일러스트를 사용합니다.", "Utilise l’illustration standard du personnage.", "Dùng hình minh họa nhân vật tiêu chuẩn."],
  fixedArt: ["Do not choose the illustration based on Mindscape level.", "不依影畫等級自動更換圖片。", "不按影画等级自动更换图片。", "凸数に応じたイラストの自動変更を無効にします。", "돌파 단계에 따라 이미지를 자동 변경하지 않습니다.", "Ne change pas l’illustration selon le niveau de cinéma.", "Không tự đổi hình theo cấp Phim Ý Cảnh."],
  busy: ["Please wait for this update.", "正在更新，請稍候。", "正在更新，请稍候。", "更新中です。お待ちください。", "업데이트 중입니다. 잠시 기다리세요.", "Mise à jour en cours. Patientez.", "Đang cập nhật. Vui lòng chờ."],
  save: ["Save", "儲存", "保存", "保存", "저장", "Enregistrer", "Lưu"],
  cancel: ["Cancel", "取消", "取消", "キャンセル", "취소", "Annuler", "Hủy"],
  done: ["Done", "完成", "完成", "完了", "완료", "Terminer", "Xong"],
  edit: ["Edit", "修改", "修改", "変更", "변경", "Modifier", "Sửa"],
  saved: ["Saved", "已儲存", "已保存", "保存しました", "저장됨", "Enregistré", "Đã lưu"],
  pending: ["Preview · not saved", "預覽，尚未儲存", "预览，尚未保存", "プレビュー・未保存", "미리보기 · 저장 전", "Aperçu · non enregistré", "Xem trước · chưa lưu"],
  conflict: ["This setting changed. Reopen it before saving.", "設定已變更，請重新開啟後再修改。", "设置已变更，请重新打开。", "設定が変更されました。開き直してください。", "설정이 변경되었습니다. 다시 여세요.", "Ce réglage a changé. Rouvrez-le.", "Cài đặt đã thay đổi. Hãy mở lại."],
  expired: ["Open the settings again.", "請重新開啟設定。", "请重新打开设置。", "設定を開き直してください。", "설정을 다시 여세요.", "Rouvrez les réglages.", "Hãy mở lại cài đặt."],
  forbidden: ["Only the owner can use this panel.", "只有本人可以操作此面板。", "只有本人可以操作。", "本人のみ操作できます。", "본인만 사용할 수 있습니다.", "Seul le propriétaire peut agir.", "Chỉ chủ sở hữu được thao tác."],
  failed: ["Could not save. Check the selection and try again.", "無法儲存，請確認選項後重試。", "无法保存，请检查选项。", "保存できません。選択を確認してください。", "저장 실패. 선택을 확인하세요.", "Échec. Vérifiez votre sélection.", "Không lưu được. Kiểm tra lựa chọn."],
  on: ["On", "開啟", "开启", "オン", "켜짐", "Activé", "Bật"],
  off: ["Off", "關閉", "关闭", "オフ", "꺼짐", "Désactivé", "Tắt"],
  enable: ["Enable", "啟用", "启用", "有効にする", "활성화", "Activer", "Bật"],
  disable: ["Disable", "停用", "停用", "無効にする", "비활성화", "Désactiver", "Tắt"],
  account: ["Reward account", "領獎帳號", "领奖账号", "受取アカウント", "보상 계정", "Compte destinataire", "Tài khoản nhận"],
  rewards: ["Rewards", "兌換獎勵", "兑换奖励", "交換報酬", "교환 보상", "Récompenses", "Phần thưởng"],
  priority: ["Priority", "優先順序", "优先顺序", "優先順位", "우선순위", "Priorité", "Ưu tiên"],
  notification: ["Notifications", "通知位置", "通知位置", "通知先", "알림 위치", "Notifications", "Thông báo"],
  dm: ["Direct message", "私訊", "私信", "DM", "개인 메시지", "Message privé", "Tin nhắn riêng"],
  channel: ["Channel", "頻道", "频道", "チャンネル", "채널", "Salon", "Kênh"],
  mention: ["Mention", "提及", "提及", "メンション", "멘션", "Mention", "Nhắc tên"],
  notSet: ["Not set", "尚未設定", "尚未设置", "未設定", "미설정", "Non défini", "Chưa đặt"],
  up: ["Move up", "上移", "上移", "上へ", "위로", "Monter", "Lên"],
  down: ["Move down", "下移", "下移", "下へ", "아래로", "Descendre", "Xuống"],
  previous: ["Previous", "上一頁", "上一页", "前へ", "이전", "Précédent", "Trước"],
  next: ["Next", "下一頁", "下一页", "次へ", "다음", "Suivant", "Tiếp"],
  items: ["items", "項", "项", "点", "개", "objets", "mục"],
  result: ["Redemption results", "兌換結果", "兑换结果", "交換結果", "교환 결과", "Résultats", "Kết quả đổi"],
  history: ["Recent results", "最近結果", "最近结果", "最近の結果", "최근 결과", "Résultats récents", "Kết quả gần đây"],
  success: ["Redeemed", "兌換成功", "兑换成功", "交換成功", "교환 성공", "Échangé", "Đã đổi"],
  already_claimed: ["Already redeemed", "已兌換", "已兑换", "交換済み", "이미 교환됨", "Déjà échangé", "Đã đổi trước đó"],
  awaiting: ["Code saved · pending", "已取得碼，待兌換", "已获取码，待兑换", "コード取得・交換待ち", "코드 저장 · 대기", "Code enregistré · en attente", "Đã lưu mã · đang chờ"],
  invalid: ["Invalid code", "兌換碼無效", "兑换码无效", "無効なコード", "유효하지 않은 코드", "Code invalide", "Mã không hợp lệ"],
  redeemFailed: ["Redemption failed", "兌換失敗", "兑换失败", "交換失敗", "교환 실패", "Échec de l’échange", "Đổi thất bại"],
  mail: ["Collect rewards from your in-game mailbox.", "請至遊戲信箱領取獎勵。", "请至游戏邮箱领取奖励。", "ゲーム内メールでお受け取りください。", "게임 내 우편에서 수령하세요.", "Récupérez les récompenses dans votre boîte en jeu.", "Nhận thưởng trong thư của trò chơi."],
  unknownReward: ["Reward details unavailable", "獎勵明細暫不可用", "奖励明细暂不可用", "報酬詳細を取得できません", "보상 정보 없음", "Détails indisponibles", "Chưa có chi tiết thưởng"],
  points: ["Points", "積分", "积分", "ポイント", "포인트", "Points", "Điểm"],
  earned: ["Earned", "本輪取得", "本轮获得", "今回獲得", "이번 획득", "Obtenus", "Nhận được"],
  spent: ["Spent", "本輪消耗", "本轮消耗", "今回消費", "이번 사용", "Dépensés", "Đã dùng"],
  remaining: ["Remaining", "剩餘", "剩余", "残り", "잔여", "Restants", "Còn lại"],
  waiting: ["Waiting for points or stock", "等待積分或補貨", "等待积分或补货", "ポイント・在庫待ち", "포인트 또는 재고 대기", "En attente de points ou de stock", "Chờ điểm hoặc bổ sung hàng"],
  unavailable: ["No active offer", "目前無可用商品", "暂无可用商品", "対象商品なし", "현재 상품 없음", "Aucune offre active", "Chưa có vật phẩm"],
  auth: ["Please update your account login.", "請更新帳號登入。", "请更新账号登录。", "アカウントを再認証してください。", "계정 로그인을 갱신하세요.", "Reconnectez votre compte.", "Hãy đăng nhập lại tài khoản."],
  uncertain: ["Purchase needs verification. No further purchases.", "購買結果待核對，已暫停新購買。", "购买结果待核对，已暂停购买。", "購入結果確認待ち。追加購入を停止中。", "구매 확인 필요. 추가 구매 중지.", "Achat à vérifier. Achats suspendus.", "Cần xác minh giao dịch. Đã dừng mua."],
  help: ["Help", "說明", "说明", "ヘルプ", "도움말", "Aide", "Hướng dẫn"],
  settings: ["Settings", "設定", "设置", "設定", "설정", "Réglages", "Cài đặt"],
  reserve: ["Points are reserved for higher-priority rewards.", "優先保留積分給順位較高的獎勵。", "优先为高順位奖励保留积分。", "優先順位の高い報酬のためにポイントを確保します。", "상위 보상을 위해 포인트를 보유합니다.", "Les points sont réservés aux récompenses prioritaires.", "Giữ điểm cho phần thưởng ưu tiên cao."],
} satisfies Record<string, readonly string[]>;
export function uiText(locale: unknown, key: keyof typeof labels): string { return labels[key][locales.indexOf(uiLocale(locale))]!; }

let fontsReady = false;
export function uiFont(locale: unknown): string {
  if (!fontsReady) {
    for (const l of locales) {
      const file = path.resolve(`src/assets/${apiLocale[l]}.ttf`);
      if (existsSync(file)) GlobalFonts.registerFromPath(file, `SettingsGame-${l}`);
    }
    fontsReady = true;
  }
  return `"SettingsGame-${uiLocale(locale)}", "SettingsGame-en", sans-serif`;
}
export const settingImages: Record<string, string> = {
  energy: "src/assets/images/zzz/official-record/battery-icon-pc.e09cdb50.png",
  polychrome: "src/assets/images/zzz/official-record/icon-feilin-summary.8643ebfe.png",
  weekly: "src/assets/images/zzz/official-record/weekly-task-done-icon.fb2d4135.png",
  daily: "src/assets/images/zzz/official-record/icon-clock.98fd05c5.png",
  event: "src/assets/images/zzz/official-record/icon-season-coins.8fb93ad4.png",
  account: "src/assets/images/icons/roleCircle/1011.webp",
};
const images = new Map<string, Promise<Image | null>>();
export async function safeImage(source?: string): Promise<Image | null> {
  if (!source) return null;
  if (images.has(source)) return images.get(source)!;
  const work = (async () => {
    if (/^https:\/\//.test(source)) {
      const url = new URL(source);
      if (!/(^|\.)(hoyolab\.com|hoyoverse\.com|mihoyo\.com|hoyolab\.net|hoyoverse\.net)$/.test(url.hostname)) return null;
      const r = await fetch(url, { signal: AbortSignal.timeout(5000), redirect: "error" });
      if (!r.ok || Number(r.headers.get("content-length") || 0) > 4_000_000) return null;
      const reader = r.body?.getReader(); if (!reader) return null;
      const chunks: Uint8Array[] = []; let size = 0;
      try { while (true) { const next = await reader.read(); if (next.done) break; size += next.value.length; if (size > 4_000_000) { await reader.cancel(); return null; } chunks.push(next.value); } }
      finally { reader.releaseLock(); }
      return await loadImage(Buffer.concat(chunks));
    }
    const file = path.resolve(settingImages[source] || source);
    if (!file.startsWith(path.resolve("src/assets") + path.sep) && !file.startsWith(path.resolve("data") + path.sep)) return null;
    return existsSync(file) ? await loadImage(file) : null;
  })().catch(() => null);
  if (images.size > 100) images.clear();
  images.set(source, work);
  const image = await work; if (!image) images.delete(source); return image;
}
export interface PreviewItem { name: string; icon?: string; detail?: string; selected?: boolean; rank?: number }
export async function renderSettingsPreview(locale: unknown, title: string, items: PreviewItem[]): Promise<Buffer> {
  const columns = items.length === 1 ? 1 : 2, width = 1000;
  const rows = Math.ceil(Math.max(1, items.length) / columns), font = uiFont(locale);
  const cellWidth = (width - 48 - (columns - 1) * 16) / columns;
  const measure = createCanvas(1, 1).getContext("2d"); measure.font = `400 24px ${font}`;
  const longName = items.some(item => measure.measureText(item.name).width > cellWidth - (item.icon ? 116 : 36));
  const cardHeight = longName ? 170 : 142, rowHeight = cardHeight + 16;
  const canvas = createCanvas(width, 114 + rows * rowHeight), ctx = canvas.getContext("2d");
  const wrapped = (text: string, x: number, y: number, maxWidth: number, lineHeight: number, limit: number) => {
    const lines: string[] = []; let line = "";
    for (const char of text) {
      if (ctx.measureText(line + char).width > maxWidth && line) { lines.push(line); line = char; } else line += char;
    }
    if (line) lines.push(line);
    for (let n = 0; n < Math.min(limit, lines.length); n++) {
      let value = lines[n];
      if (n === limit - 1 && lines.length > limit) { while (ctx.measureText(value + "…").width > maxWidth) value = value.slice(0, -1); value += "…"; }
      ctx.fillText(value, x, y + n * lineHeight);
    }
    return Math.min(limit, lines.length);
  };
  ctx.fillStyle = "#15171b"; ctx.fillRect(0, 0, width, canvas.height);
  ctx.fillStyle = "#e1f58a"; ctx.font = `400 28px ${font}`; wrapped(title, 24, 38, 952, 32, 1);
  ctx.fillStyle = "#c3cbd3"; ctx.font = `400 20px ${font}`; wrapped(uiText(locale, "imageGuide"), 24, 76, 952, 24, 1);
  if (!items.length) { ctx.fillStyle = "#f5f6f8"; ctx.font = `24px ${font}`; ctx.fillText(uiText(locale, "emptySelection"), 30, 164); }
  for (const [i, item] of items.entries()) {
    const x = 24 + (i % columns) * (cellWidth + 16), y = 104 + Math.floor(i / columns) * rowHeight;
    ctx.fillStyle = "#252b32"; ctx.beginPath(); ctx.roundRect(x, y, cellWidth, cardHeight, 12); ctx.fill();
    if (item.selected) { ctx.strokeStyle = "#d7f28c"; ctx.lineWidth = 2; ctx.stroke(); }
    const img = await safeImage(item.icon);
    if (img) { const scale = 66 / Math.max(img.width, img.height); ctx.drawImage(img, x + 16 + (66 - img.width * scale) / 2, y + 18, img.width * scale, img.height * scale); }
    const textX = x + (img ? 98 : 18), available = cellWidth - (img ? 116 : 36);
    ctx.fillStyle = "#f5f6f8"; ctx.font = `400 24px ${font}`;
    const nameLines = wrapped(item.name, textX, y + 37, available, 28, 2);
    ctx.fillStyle = item.selected ? "#d7f28c" : "#bac5d0"; ctx.font = `400 19px ${font}`;
    const state = item.rank ? `${uiText(locale, "priorityLabel")} ${item.rank}` : item.selected === undefined ? "" : uiText(locale, item.selected ? "selectedValue" : "unselectedValue");
    const stateY = y + 37 + Math.max(1, nameLines) * 28;
    wrapped(state, textX, stateY, available, 24, 1);
    ctx.fillStyle = "#d2d9e0"; ctx.font = `400 20px ${font}`; wrapped(item.detail || "", x + 18, stateY + 34, cellWidth - 36, 25, 2);
  }
  return canvas.toBuffer("image/png");
}

/** Explain each display option without presenting a placeholder as a real card. */
export async function renderProfileSettingPreview(locale: unknown, title: string, key: string, selected: string, options: { label: string; value: string; description?: string }[]): Promise<Buffer> {
  return renderSettingsPreview(locale, title, options.map(option => ({
    name: option.label, selected: selected === option.value,
    detail: option.description, icon: key === "profileStyle" ? "account" : undefined,
  })));
}
