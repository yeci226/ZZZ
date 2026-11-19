import type { LocalizationMap } from "discord.js";
import { normalizeZzzLocale } from "./canvasFonts.js";

// Strings for the "Redeem codes" message context-menu command, in tw, cn, en, jp, kr, fr, vi order.
// Result wording (success / already redeemed / invalid) reuses the bot's redeem_* language keys.
const COPY = {
  notFound: [
    "沒有在這則訊息中找到絕區零兌換碼。",
    "没有在这条消息中找到绝区零兑换码。",
    "No Zenless Zone Zero redemption codes were found in this message.",
    "このメッセージにゼンレスゾーンゼロのギフトコードは見つかりませんでした。",
    "이 메시지에서 젠레스 존 제로 교환 코드를 찾지 못했습니다.",
    "Aucun code d’échange Zenless Zone Zero n’a été trouvé dans ce message.",
    "Không tìm thấy mã đổi thưởng Zenless Zone Zero trong tin nhắn này.",
  ],
  noAccountTitle: [
    "尚未設置帳號",
    "尚未设置帐号",
    "Account has not been set up",
    "アカウントが設定されていません",
    "아직 계정이 설정되지 않았습니다",
    "Compte non configuré.",
    "Bạn vẫn chưa thiết lập tài khoản!",
  ],
  noAccountDesc: [
    "請先使用 `/account` 綁定帳號，再兌換禮包碼。",
    "请先使用 `/account` 绑定帐号，再兑换礼包码。",
    "Link an account with `/account` first, then redeem codes.",
    "先に `/account` でアカウントを連携してからコードを引き換えてください。",
    "먼저 `/account`로 계정을 연동한 뒤 코드를 교환하세요.",
    "Reliez d’abord un compte avec `/account`, puis échangez les codes.",
    "Hãy liên kết tài khoản bằng `/account` trước, rồi đổi mã.",
  ],
  title: [
    "兌換結果",
    "兑换结果",
    "Redeem results",
    "引き換え結果",
    "교환 결과",
    "Résultats de l’échange",
    "Kết quả đổi mã",
  ],
  usedUid: [
    "使用帳號 UID：{uid}",
    "使用帐号 UID：{uid}",
    "Account UID used: {uid}",
    "使用したUID：{uid}",
    "사용한 계정 UID: {uid}",
    "UID utilisé : {uid}",
    "UID đã dùng: {uid}",
  ],
  truncated: [
    "只處理前 {max} 組兌換碼，其餘已略過。",
    "只处理前 {max} 组兑换码，其余已略过。",
    "Only the first {max} codes were processed; the rest were skipped.",
    "最初の{max}件のみ処理し、残りはスキップしました。",
    "처음 {max}개의 코드만 처리했고 나머지는 건너뛰었습니다.",
    "Seuls les {max} premiers codes ont été traités ; les autres sont ignorés.",
    "Chỉ xử lý {max} mã đầu tiên, các mã còn lại đã bị bỏ qua.",
  ],
  busy: [
    "這個帳號正在兌換中，請等目前的兌換完成後再試。",
    "这个帐号正在兑换中，请等当前的兑换完成后再试。",
    "This account is already redeeming codes. Wait for it to finish, then try again.",
    "このアカウントは引き換え中です。完了してからもう一度お試しください。",
    "이 계정은 이미 교환 중입니다. 완료된 뒤 다시 시도하세요.",
    "Ce compte est déjà en cours d’échange. Attendez la fin, puis réessayez.",
    "Tài khoản này đang đổi mã. Hãy chờ hoàn tất rồi thử lại.",
  ],
  skipped: [
    "已因登入失效中止",
    "已因登录失效中止",
    "Stopped: login expired",
    "ログイン失効のため中止",
    "로그인 만료로 중단됨",
    "Arrêté : connexion expirée",
    "Đã dừng: đăng nhập hết hạn",
  ],
} as const;

export type RedeemContextKey = keyof typeof COPY;
const ORDER = ["tw", "cn", "en", "jp", "kr", "fr", "vi"] as const;

export function redeemContextText(locale: string | undefined, key: RedeemContextKey): string {
  const index = ORDER.indexOf(normalizeZzzLocale(locale) as (typeof ORDER)[number]);
  return COPY[key][index < 0 ? 2 : index];
}

/** Context-menu names are 1-32 characters; the default (English) name is "Redeem codes". */
export const REDEEM_CONTEXT_NAME = "Redeem codes";
export const REDEEM_CONTEXT_NAMES: LocalizationMap = {
  "zh-TW": "兌換禮包碼",
  "zh-CN": "兑换礼包码",
  "en-US": "Redeem codes",
  "en-GB": "Redeem codes",
  ja: "ギフトコードを引き換え",
  ko: "기프트 코드 교환",
  fr: "Échanger les codes",
  vi: "Đổi mã quà tặng",
};
