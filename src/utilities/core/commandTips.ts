import { randomInt } from "node:crypto";
import { locales, uiLocale } from "../settings/presentation.js";

const copy = {
  daily: [
    "Use /setup to enable automatic daily check-in.",
    "使用 /setup 開啟自動簽到，每天自動領取簽到獎勵。",
    "使用 /setup 开启自动签到，每天自动领取签到奖励。",
    "/setup で毎日の自動チェックインを有効にできます。",
    "/setup에서 자동 일일 출석을 켤 수 있어요.",
    "Activez la connexion quotidienne automatique avec /setup.",
    "Dùng /setup để bật điểm danh tự động hằng ngày.",
  ],
  mimo: [
    "Enable Auto Mimo in /setup to earn activity points and exchange rewards.",
    "在 /setup 開啟 Auto Mimo，自動取得活動積分並兌換獎勵。",
    "在 /setup 开启 Auto Mimo，自动获取活动积分并兑换奖励。",
    "/setup の Auto Mimo でイベントポイントを獲得し、報酬に交換できます。",
    "/setup의 Auto Mimo로 이벤트 포인트를 모으고 보상을 교환하세요.",
    "Activez Auto Mimo dans /setup pour gagner des points et échanger des récompenses.",
    "Bật Auto Mimo trong /setup để nhận điểm sự kiện và đổi thưởng.",
  ],
  setup: [
    "Use /setup to quickly configure check-in, code redemption, Mimo and reminders.",
    "使用 /setup 快速設定自動簽到、兌換、Mimo 與遊戲提醒。",
    "使用 /setup 快速设置自动签到、兑换、Mimo 与游戏提醒。",
    "/setup で自動チェックイン・コード交換・Mimo・通知をまとめて設定できます。",
    "/setup에서 자동 출석, 코드 교환, Mimo와 알림을 빠르게 설정하세요.",
    "Configurez connexion, codes, Mimo et rappels avec /setup.",
    "Dùng /setup để thiết lập nhanh điểm danh, đổi mã, Mimo và nhắc nhở.",
  ],
  redeem: [
    "Enable automatic code redemption in /setup to process new codes automatically.",
    "在 /setup 開啟自動兌換，新兌換碼會自動處理。",
    "在 /setup 开启自动兑换，新兑换码会自动处理。",
    "/setup でコードの自動交換を有効にすると、新しいコードを自動処理します。",
    "/setup에서 자동 교환을 켜면 새 교환 코드를 자동으로 처리해요.",
    "Activez l’échange automatique dans /setup pour traiter les nouveaux codes.",
    "Bật đổi mã tự động trong /setup để tự xử lý mã mới.",
  ],
  notifications: [
    "Choose where to receive automatic redemption results in /setup.",
    "可在 /setup 調整自動兌換結果的通知位置與是否提及。",
    "可在 /setup 调整自动兑换结果的通知位置与是否提及。",
    "/setup で自動交換結果の通知先とメンションを設定できます。",
    "/setup에서 자동 교환 결과의 알림 위치와 멘션을 설정하세요.",
    "Choisissez la destination et les mentions des résultats automatiques dans /setup.",
    "Chọn nơi nhận kết quả đổi mã tự động và nhắc tên trong /setup.",
  ],
  energy: [
    "Use /setup to receive a reminder before your energy fills up.",
    "使用 /setup 設定電量提醒，在電量回滿前收到通知。",
    "使用 /setup 设置电量提醒，在电量回满前收到通知。",
    "/setup でバッテリーが満タンになる前の通知を設定できます。",
    "/setup에서 에너지가 가득 차기 전 알림을 설정하세요.",
    "Recevez un rappel avant que l’énergie soit pleine avec /setup.",
    "Dùng /setup để nhận nhắc nhở trước khi năng lượng đầy.",
  ],
  dailyReminder: [
    "Enable reminders for unfinished daily tasks in /setup.",
    "在 /setup 開啟每日提醒，接收尚未完成的每日項目通知。",
    "在 /setup 开启每日提醒，接收尚未完成的每日项目通知。",
    "/setup で未完了のデイリー項目の通知を有効にできます。",
    "/setup에서 미완료 일일 임무 알림을 켜세요.",
    "Activez les rappels des tâches quotidiennes inachevées dans /setup.",
    "Bật nhắc nhở nhiệm vụ hằng ngày chưa hoàn thành trong /setup.",
  ],
  weeklyReminder: [
    "Configure weekly and event deadline reminders in /setup.",
    "使用 /setup 設定每週任務與活動截止提醒。",
    "使用 /setup 设置每周任务与活动截止提醒。",
    "/setup で週次任務やイベントの期限通知を設定できます。",
    "/setup에서 주간 임무와 이벤트 마감 알림을 설정하세요.",
    "Configurez les rappels d’échéance hebdomadaires et d’événements dans /setup.",
    "Đặt nhắc nhở hạn nhiệm vụ tuần và sự kiện trong /setup.",
  ],
  log: [
    "Use /signal log to view saved signal history.",
    "使用 /signal log 查看已儲存的調頻紀錄。",
    "使用 /signal log 查看已保存的调频记录。",
    "/signal log で保存済みの変調履歴を確認できます。",
    "/signal log로 저장된 신호 검색 기록을 확인하세요.",
    "Consultez l’historique enregistré avec /signal log.",
    "Dùng /signal log để xem lịch sử dò tín hiệu đã lưu.",
  ],
  import: [
    "Use /signal import to import history from a game URL or rng.moe backup.",
    "使用 /signal import 從遊戲連結或 rng.moe 備份匯入調頻紀錄。",
    "使用 /signal import 从游戏链接或 rng.moe 备份导入调频记录。",
    "/signal import でゲームの URL や rng.moe のバックアップから履歴を取り込めます。",
    "/signal import로 게임 URL이나 rng.moe 백업에서 기록을 가져오세요.",
    "Importez l’historique depuis une URL de jeu ou une sauvegarde rng.moe avec /signal import.",
    "Dùng /signal import để nhập lịch sử từ URL trò chơi hoặc bản sao rng.moe.",
  ],
  privacy: [
    "Control who can view your signal history and banner resources in /settings.",
    "可在 /settings 設定是否允許他人查看抽卡資訊與卡池資源。",
    "可在 /settings 设置是否允许他人查看抽卡信息与卡池资源。",
    "/settings で変調履歴やバナーの資源情報の公開を設定できます。",
    "/settings에서 신호 기록과 배너 재화 정보 공개 여부를 설정하세요.",
    "Réglez la visibilité de votre historique et de vos ressources dans /settings.",
    "Điều chỉnh quyền xem lịch sử và tài nguyên banner trong /settings.",
  ],
  ranking: [
    "Use /leaderboard to view character drive disc rankings.",
    "使用 /leaderboard 查看角色的驅動盤排行。",
    "使用 /leaderboard 查看角色的驱动盘排行。",
    "/leaderboard でキャラクターのドライバディスクランキングを確認できます。",
    "/leaderboard에서 캐릭터 드라이브 디스크 순위를 확인하세요.",
    "Consultez les classements des disques des personnages avec /leaderboard.",
    "Dùng /leaderboard để xem xếp hạng đĩa của nhân vật.",
  ],
  appearance: [
    "Customize profile card style and character artwork in /settings.",
    "可在 /settings 調整個人簡介圖卡樣式與角色立繪。",
    "可在 /settings 调整个人简介图卡样式与角色立绘。",
    "/settings でプロフィールカードのスタイルや立ち絵を変更できます。",
    "/settings에서 프로필 카드 스타일과 캐릭터 일러스트를 바꾸세요.",
    "Personnalisez le style des cartes et les illustrations dans /settings.",
    "Tùy chỉnh kiểu thẻ hồ sơ và hình nhân vật trong /settings.",
  ],
} satisfies Record<string, readonly string[]>;
export const COMMAND_TIP_POOLS = {
  daily: ["daily", "mimo", "setup"],
  codes: ["redeem", "notifications", "mimo"],
  note: ["energy", "dailyReminder", "weeklyReminder"],
  banner: ["log", "import", "privacy"],
  profile: ["ranking", "appearance", "setup"],
  team: ["ranking", "appearance", "setup"],
} as const satisfies Record<string, readonly (keyof typeof copy)[]>;
export type CommandTipPool = keyof typeof COMMAND_TIP_POOLS;
const allTips = new Set(Object.values(copy).flat());
const prefix = "-# 💡 ";
const tipsByInteraction = new WeakMap<object, string>();
// Message-scoped only: no per-user history. Message content recovers the choice after restarts.
const tipsByMessage = new Map<string, string>();
function existingTip(content: string): string | undefined {
  return content
    .split("\n")
    .find(
      (line) =>
        line.startsWith(prefix) && allTips.has(line.slice(prefix.length)),
    )
    ?.slice(prefix.length);
}
export function selectCommandTip(
  pool: CommandTipPool,
  locale: unknown,
  pick = randomInt,
): string {
  const choices = COMMAND_TIP_POOLS[pool];
  return copy[choices[pick(choices.length)]][locales.indexOf(uiLocale(locale))];
}
/** Preserve status text and one stable hint through component edits and background updates. */
export function commandTipContent(
  interaction: any,
  pool: CommandTipPool,
  locale: unknown,
  content = "",
  flags?: unknown,
): string {
  const bits = (value: any) => Number(value?.bitfield ?? value ?? 0);
  if ((bits(flags) | bits(interaction.message?.flags)) & 32768) return content;
  const key =
    interaction.message?.interactionMetadata?.id ||
    interaction.message?.interaction?.id ||
    interaction.message?.id ||
    interaction.id;
  const selected =
    tipsByInteraction.get(interaction) ||
    (key && tipsByMessage.get(key)) ||
    existingTip(content) ||
    existingTip(interaction.message?.content || "") ||
    selectCommandTip(pool, locale);
  tipsByInteraction.set(interaction, selected);
  if (key) {
    if (tipsByMessage.size >= 10_000 && !tipsByMessage.has(key))
      tipsByMessage.delete(tipsByMessage.keys().next().value!);
    tipsByMessage.set(key, selected);
  }
  const original = content
    .split("\n")
    .filter(
      (line) =>
        !(line.startsWith(prefix) && allTips.has(line.slice(prefix.length))),
    )
    .join("\n");
  const result = `${original}${original ? "\n" : ""}${prefix}${selected}`;
  return result.length <= 2000 ? result : original;
}
export function withCommandTip<T extends { content?: string; flags?: unknown }>(
  interaction: any,
  pool: CommandTipPool,
  locale: unknown,
  payload: T,
): T {
  if (
    (Number((payload.flags as any)?.bitfield ?? payload.flags ?? 0) |
      Number(
        interaction.message?.flags?.bitfield ?? interaction.message?.flags ?? 0,
      )) &
    32768
  )
    return payload;
  return {
    ...payload,
    content: commandTipContent(
      interaction,
      pool,
      locale,
      payload.content || "",
      payload.flags,
    ),
  };
}
