import { locales, uiLocale } from "./presentation.js";

const copy = {
  mimo: ["Automatic Mimo tasks", "自動 Mimo 任務", "自动 Mimo 任务", "Mimo 自動タスク", "Mimo 자동 임무", "Tâches Mimo automatiques", "Nhiệm vụ Mimo tự động"],
  reminder: ["Game reminders", "遊戲提醒", "游戏提醒", "リマインダー", "알림", "Rappels", "Nhắc nhở"],
  reminderDesc: ["Configure energy, daily, weekly and event reminders.", "設定電量、每日任務、每週任務與活動的提醒條件，以及接收通知的位置。", "设置电量、每日任务、每周任务与活动的提醒条件，以及接收通知的位置。", "バッテリー・デイリー・ウィークリー・イベントの通知を設定します。", "배터리, 일일, 주간 및 이벤트 알림을 설정합니다.", "Configurer les rappels de batterie, quotidiens, hebdomadaires et d’événements.", "Đặt nhắc nhở năng lượng, hằng ngày, hằng tuần và sự kiện."],
  daily: ["Automatic check-in", "自動簽到", "自动签到", "自動チェックイン", "자동 출석", "Connexion automatique", "Điểm danh tự động"],
  redeem: ["Automatic code redemption", "自動兌換碼", "自动兑换码", "コード自動交換", "코드 자동 교환", "Échange automatique de codes", "Tự động đổi mã"],
  dailyDesc: ["Check in for all linked accounts daily at the selected Taiwan time (UTC+8).", "每天自動替已綁定的帳號完成 HoYoLAB 簽到。可設定簽到時間（台灣時間）與結果通知。", "每天自动替已绑定的账号完成 HoYoLAB 签到。可设置签到时间（台湾时间）与结果通知。", "台湾時間（UTC+8）の指定時刻に全連携アカウントでチェックインします。", "대만 시간(UTC+8)에 모든 연결 계정에 출석합니다.", "Connecte tous les comptes liés à l’heure de Taïwan choisie (UTC+8).", "Điểm danh mọi tài khoản liên kết theo giờ Đài Loan (UTC+8)."],
  redeemDesc: ["Automatically redeem available codes for all linked accounts.", "發現新的兌換碼時，自動替已綁定的帳號兌換。可設定結果通知。", "发现新的兑换码时，自动替已绑定的账号兑换。可设置结果通知。", "全連携アカウントで利用可能なコードを自動交換します。", "모든 연결 계정에서 사용 가능한 코드를 자동 교환합니다.", "Échange les codes disponibles pour tous les comptes liés.", "Tự động đổi mã có sẵn cho mọi tài khoản liên kết."],
  mimoDesc: ["Configure Mimo tasks, rewards and notifications.", "自動完成 Mimo 活動任務、累積積分並兌換獎勵。可設定領獎帳號、獎勵與通知。", "自动完成 Mimo 活动任务、累积积分并兑换奖励。可设置领奖账号、奖励与通知。", "Mimo の自動タスク・報酬・通知を設定します。", "Mimo 자동 임무, 보상 및 알림을 설정합니다.", "Configurer les tâches Mimo, récompenses et notifications.", "Đặt nhiệm vụ Mimo, phần thưởng và thông báo."],
  sync: ["Automatically sync wish history", "自動同步抽卡紀錄", "自动同步抽卡记录", "ガチャ履歴の自動同期", "뽑기 기록 자동 동기화", "Synchronisation automatique des tirages", "Tự động đồng bộ lịch sử gacha"],
  syncDesc: ["Sync official wish history every 7 days for all linked accounts. Turning this off keeps saved records.", "每 7 天同步全部綁定帳號的官方抽卡紀錄；關閉不會刪除已保存的紀錄。", "每 7 天同步全部绑定账号的官方抽卡记录；关闭不会删除已保存的记录。", "全連携アカウントの公式ガチャ履歴を7日ごとに同期します。オフでも保存済み履歴は残ります。", "7일마다 연결 계정의 공식 뽑기 기록을 동기화합니다. 꺼도 저장된 기록은 유지됩니다.", "Synchronise les tirages officiels des comptes liés tous les 7 jours. Les données restent après désactivation.", "Đồng bộ lịch sử gacha chính thức mỗi 7 ngày cho mọi tài khoản liên kết. Tắt không xóa dữ liệu đã lưu."],
  back: ["Back to settings", "返回設定", "返回设置", "設定に戻る", "설정으로 돌아가기", "Retour aux réglages", "Về cài đặt"],
  time: ["Check-in time (Taiwan, UTC+8)", "簽到時間（台灣 UTC+8）", "签到时间（台湾 UTC+8）", "チェックイン時刻（台湾 UTC+8）", "출석 시간(대만 UTC+8)", "Heure de connexion (Taïwan, UTC+8)", "Giờ điểm danh (Đài Loan, UTC+8)"],
  enabled: ["Automatic execution", "自動執行", "自动执行", "自動実行", "자동 실행", "Exécution automatique", "Tự động thực hiện"],
  hintDaily: ["Tip: configure automatic check-in in /setup.", "提示：可到 /setup 設定自動簽到。", "提示：可到 /setup 设置自动签到。", "ヒント：/setup で自動チェックインを設定できます。", "팁: /setup에서 자동 출석을 설정할 수 있습니다.", "Astuce : configurez la connexion automatique dans /setup.", "Gợi ý: thiết lập điểm danh tự động trong /setup."],
  hintRedeem: ["Tip: configure automatic code redemption in /setup.", "提示：可到 /setup 設定自動兌換碼。", "提示：可到 /setup 设置自动兑换码。", "ヒント：/setup でコード自動交換を設定できます。", "팁: /setup에서 코드 자동 교환을 설정할 수 있습니다.", "Astuce : configurez l’échange automatique de codes dans /setup.", "Gợi ý: thiết lập tự động đổi mã trong /setup."],
  notificationDesc: ["Turning notifications off does not stop automatic execution. Choose a server channel in that server.", "關閉通知不會停止自動執行；頻道通知請在該伺服器內選擇接收頻道。", "关闭通知不会停止自动执行；频道通知请在该服务器内选择接收频道。", "通知をオフにしても自動実行は続きます。通知先チャンネルはそのサーバー内で選択してください。", "알림을 꺼도 자동 실행은 계속됩니다. 서버에서 알림 채널을 선택하세요.", "Désactiver les notifications ne désactive pas l’automatisation. Choisissez le salon depuis son serveur.", "Tắt thông báo không dừng tự động. Chọn kênh thông báo trong máy chủ đó."],
} satisfies Record<string, readonly string[]>;
export function automationText(locale: unknown, key: keyof typeof copy): string {
  return copy[key][locales.indexOf(uiLocale(locale))]!;
}
