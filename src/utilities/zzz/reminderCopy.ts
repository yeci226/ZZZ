export type ReminderLocale = "en" | "tw" | "cn" | "jp" | "kr" | "fr" | "vi";

export interface ReminderCopy {
  title: string;
  homeDescription: string;
  newDescription: string;
  steps: [string, string, string, string, string, string];
  stepDescriptions: [string, string, string, string, string, string];
  stepLabel: string;
  sectionDestination: string;
  sectionMention: string;
  sectionCondition: string;
  sectionItems: string;
  sectionTime: string;
  sectionTarget: string;
  status: string;
  destination: string;
  mention: string;
  energy: string;
  daily: string;
  weekly: string;
  event: string;
  enabled: string;
  disabled: string;
  yes: string;
  no: string;
  notSet: string;
  dm: string;
  currentChannel: string;
  edit: string;
  enable: string;
  disable: string;
  back: string;
  next: string;
  cancel: string;
  save: string;
  saveEnable: string;
  useCurrent: string;
  useDm: string;
  mentionOn: string;
  mentionOff: string;
  custom: string;
  customTime: string;
  customValue: string;
  customTimeTarget: string;
  vitality: string;
  scratch: string;
  vhs: string;
  bounty: string;
  weeklyPoints: string;
  eventRewards: string;
  modeOff: string;
  modeTime: string;
  modeAmount: string;
  chooseMode: string;
  chooseValue: string;
  chooseHours: string;
  chooseTarget: string;
  chooseChannel: string;
  customEnergyTitle: string;
  customDailyTitle: string;
  customWeeklyTitle: string;
  customEventTitle: string;
  energyInput: string;
  energyAmountInput: string;
  durationExample: string;
  dailyInput: string;
  weeklyHoursInput: string;
  weeklyTargetInput: string;
  eventInput: string;
  expired: string;
  notOwner: string;
  invalidChannel: string;
  invalidNumber: string;
  invalidDuration: string;
  beforeReset: string;
  beforeEnd: string;
  pointUnit: string;
  energyUnit: string;
  noTriggers: string;
  noDestination: string;
  saved: string;
  cancelled: string;
}

export const REMINDER_COPY: Record<ReminderLocale, ReminderCopy> = {
  en: {
    title: "Real-time note reminders", homeDescription: "Review your current settings, edit them, or turn reminders on or off.",
    newDescription: "Complete these six short steps. Nothing is saved until the final confirmation.",
    steps: ["Choose delivery method", "Set energy reminder", "Set daily reminders", "Set weekly reminders", "Set event reminders", "Review reminder settings"],
    stepDescriptions: ["Choose where reminders are sent and whether you are mentioned.", "Choose how the energy reminder works.", "Choose daily tasks and the reminder time.", "Choose weekly tasks, timing, and points target.", "Choose whether and when event rewards are checked.", "Review everything before saving."],
    stepLabel: "Step", sectionDestination: "Notification destination", sectionMention: "Mention settings", sectionCondition: "Reminder condition", sectionItems: "Reminder items", sectionTime: "Reminder time", sectionTarget: "Points target",
    status: "Status", destination: "Delivery", mention: "Mention", energy: "Energy", daily: "Daily", weekly: "Weekly", event: "Events",
    enabled: "Enabled", disabled: "Disabled", yes: "Yes", no: "No", notSet: "Not set", dm: "Direct message", currentChannel: "Current channel",
    edit: "Edit settings", enable: "Enable reminders", disable: "Disable reminders", back: "Previous step", next: "Next step", cancel: "Cancel", save: "Save settings", saveEnable: "Save and enable",
    useCurrent: "Use this channel", useDm: "Use DM", mentionOn: "Mention: on", mentionOff: "Mention: off", custom: "Custom", customTime: "Custom time", customValue: "Custom value", customTimeTarget: "Custom time and target",
    vitality: "Daily activity", scratch: "Scratch card", vhs: "Video store", bounty: "Bounties", weeklyPoints: "Weekly points", eventRewards: "Event rewards",
    modeOff: "Off", modeTime: "Time until full", modeAmount: "Current energy amount", chooseMode: "Choose energy mode", chooseValue: "Choose a value", chooseHours: "Choose reminder time", chooseTarget: "Choose points target", chooseChannel: "Choose another channel",
    customEnergyTitle: "Custom energy reminder", customDailyTitle: "Custom daily time", customWeeklyTitle: "Custom weekly settings", customEventTitle: "Custom event time",
    energyInput: "Time (15 minutes–12 hours)", energyAmountInput: "Energy amount (1–240)", durationExample: "e.g. 30 minutes, 1 hour", dailyInput: "Before reset (1–12 hours)", weeklyHoursInput: "Before reset (1 hour–7 days)", weeklyTargetInput: "Points target (1–2100)", eventInput: "Before ending (1 hour–7 days)",
    expired: "This setup session has expired. Run `/settings` again.", notOwner: "Only the user who opened this setup can use it.", invalidChannel: "That channel cannot be used. You and the bot must be able to view and send there; the bot also needs Attach Files.", invalidNumber: "Enter a whole number within the range shown.", invalidDuration: "Enter a valid time within the displayed range, such as `30 minutes` or `1 hour`.", beforeReset: "Before reset", beforeEnd: "Before ending", pointUnit: "pts", energyUnit: "energy", noTriggers: "Turn on at least one reminder before saving.", noDestination: "Choose a notification destination before saving.", saved: "Reminder settings saved.", cancelled: "Setup cancelled. No changes were saved.",
  },
  tw: {
    title: "即時便箋提醒", homeDescription: "查看目前設定、進行編輯，或啟用／關閉提醒。",
    newDescription: "依序完成六個簡短步驟；直到最後確認前都不會儲存。",
    steps: ["選擇通知方式", "設定電量提醒", "設定每日任務提醒", "設定每週任務提醒", "設定活動提醒", "確認提醒設定"],
    stepDescriptions: ["請選擇要以哪種方式接收提醒。", "請選擇電量提醒的方式與數值。", "請選擇要提醒的每日項目與時間。", "請選擇要提醒的每週項目、時間與點數目標。", "請選擇是否提醒活動獎勵與提醒時間。", "請確認以下設定是否正確。"],
    stepLabel: "步驟", sectionDestination: "通知位置", sectionMention: "提及設定", sectionCondition: "提醒條件", sectionItems: "提醒項目", sectionTime: "提醒時間", sectionTarget: "點數目標",
    status: "狀態", destination: "通知位置", mention: "提及", energy: "電量", daily: "每日", weekly: "每週", event: "活動",
    enabled: "啟用", disabled: "停用", yes: "是", no: "否", notSet: "尚未設定", dm: "私訊", currentChannel: "目前頻道",
    edit: "編輯設定", enable: "啟用提醒", disable: "關閉提醒", back: "上一步", next: "下一步", cancel: "取消", save: "儲存設定", saveEnable: "儲存並啟用",
    useCurrent: "使用目前頻道", useDm: "使用私訊", mentionOn: "提及：開", mentionOff: "提及：關", custom: "自訂", customTime: "自訂時間", customValue: "自訂數值", customTimeTarget: "自訂時間與目標",
    vitality: "當日活躍度", scratch: "刮刮樂", vhs: "錄影帶店", bounty: "懸賞委託", weeklyPoints: "每週點數", eventRewards: "活動獎勵",
    modeOff: "關閉", modeTime: "距離充滿時間", modeAmount: "目前電量數值", chooseMode: "選擇電量模式", chooseValue: "選擇數值", chooseHours: "選擇提醒時間", chooseTarget: "選擇點數目標", chooseChannel: "選擇其他頻道",
    customEnergyTitle: "自訂電量提醒", customDailyTitle: "自訂每日時間", customWeeklyTitle: "自訂每週設定", customEventTitle: "自訂活動時間",
    energyInput: "時間（15 分鐘～12 小時）", energyAmountInput: "電量數值（1～240）", durationExample: "例如：30 分鐘、1 小時", dailyInput: "重置前時間（1～12 小時）", weeklyHoursInput: "重置前時間（1 小時～7 天）", weeklyTargetInput: "點數目標（1–2100）", eventInput: "結束前時間（1 小時～7 天）",
    expired: "這個設定階段已逾時，請重新執行 `/settings`。", notOwner: "只有開啟這個設定的使用者可以操作。", invalidChannel: "無法使用該頻道。你與 Bot 必須能查看及發送訊息，Bot 另需附加檔案權限。", invalidNumber: "請輸入提示範圍內的整數。", invalidDuration: "請輸入範圍內的時間，例如 `30 分鐘`、`1 小時`。", beforeReset: "重置前", beforeEnd: "結束前", pointUnit: "點", energyUnit: "點電量", noTriggers: "儲存前請至少開啟一項提醒。", noDestination: "儲存前請選擇通知位置。", saved: "提醒設定已儲存。", cancelled: "已取消設定，沒有儲存任何變更。",
  },
  cn: {
    title: "实时便笺提醒", homeDescription: "查看当前设置、进行编辑，或启用／关闭提醒。",
    newDescription: "依次完成六个简短步骤；最终确认前不会保存。",
    steps: ["选择通知方式", "设置电量提醒", "设置每日任务提醒", "设置每周任务提醒", "设置活动提醒", "确认提醒设置"],
    stepDescriptions: ["请选择要以哪种方式接收提醒。", "请选择电量提醒的方式和数值。", "请选择要提醒的每日项目和时间。", "请选择要提醒的每周项目、时间和点数目标。", "请选择是否提醒活动奖励和提醒时间。", "请确认以下设置是否正确。"],
    stepLabel: "步骤", sectionDestination: "通知位置", sectionMention: "提及设置", sectionCondition: "提醒条件", sectionItems: "提醒项目", sectionTime: "提醒时间", sectionTarget: "点数目标",
    status: "状态", destination: "通知位置", mention: "提及", energy: "电量", daily: "每日", weekly: "每周", event: "活动",
    enabled: "启用", disabled: "停用", yes: "是", no: "否", notSet: "尚未设置", dm: "私信", currentChannel: "当前频道",
    edit: "编辑设置", enable: "启用提醒", disable: "关闭提醒", back: "上一步", next: "下一步", cancel: "取消", save: "保存设置", saveEnable: "保存并启用",
    useCurrent: "使用当前频道", useDm: "使用私信", mentionOn: "提及：开", mentionOff: "提及：关", custom: "自定义", customTime: "自定义时间", customValue: "自定义数值", customTimeTarget: "自定义时间和目标",
    vitality: "当日活跃度", scratch: "刮刮乐", vhs: "录像带店", bounty: "悬赏委托", weeklyPoints: "每周点数", eventRewards: "活动奖励",
    modeOff: "关闭", modeTime: "距离充满时间", modeAmount: "当前电量数值", chooseMode: "选择电量模式", chooseValue: "选择数值", chooseHours: "选择提醒时间", chooseTarget: "选择点数目标", chooseChannel: "选择其他频道",
    customEnergyTitle: "自定义电量提醒", customDailyTitle: "自定义每日时间", customWeeklyTitle: "自定义每周设置", customEventTitle: "自定义活动时间",
    energyInput: "时间（15 分钟～12 小时）", energyAmountInput: "电量数值（1～240）", durationExample: "例如：30 分钟、1 小时", dailyInput: "重置前时间（1～12 小时）", weeklyHoursInput: "重置前时间（1 小时～7 天）", weeklyTargetInput: "点数目标（1–2100）", eventInput: "结束前时间（1 小时～7 天）",
    expired: "此设置会话已过期，请重新运行 `/settings`。", notOwner: "只有打开此设置的用户可以操作。", invalidChannel: "无法使用该频道。你和机器人必须能够查看并发送消息，机器人还需要附加文件权限。", invalidNumber: "请输入提示范围内的整数。", invalidDuration: "请输入范围内的时间，例如 `30 分钟`、`1 小时`。", beforeReset: "重置前", beforeEnd: "结束前", pointUnit: "点", energyUnit: "点电量", noTriggers: "保存前请至少开启一项提醒。", noDestination: "保存前请选择通知位置。", saved: "提醒设置已保存。", cancelled: "已取消设置，没有保存任何更改。",
  },
  jp: {
    title: "リアルタイムノート通知", homeDescription: "現在の設定を確認・編集し、通知を有効または無効にします。",
    newDescription: "6つの短い手順で設定します。最後に確認するまで保存されません。",
    steps: ["通知方法を選択", "バッテリー通知を設定", "デイリー通知を設定", "週間通知を設定", "イベント通知を設定", "通知設定を確認"],
    stepDescriptions: ["通知先とメンションの有無を選びます。", "バッテリー通知の条件を選びます。", "デイリー項目と通知時刻を選びます。", "週間項目、通知時刻、ポイント目標を選びます。", "イベント報酬の確認と通知時刻を選びます。", "保存前にすべての設定を確認します。"],
    stepLabel: "ステップ", sectionDestination: "通知先", sectionMention: "メンション設定", sectionCondition: "通知条件", sectionItems: "通知項目", sectionTime: "通知時間", sectionTarget: "ポイント目標",
    status: "状態", destination: "通知先", mention: "メンション", energy: "バッテリー", daily: "デイリー", weekly: "ウィークリー", event: "イベント",
    enabled: "有効", disabled: "無効", yes: "はい", no: "いいえ", notSet: "未設定", dm: "ダイレクトメッセージ", currentChannel: "現在のチャンネル",
    edit: "設定を編集", enable: "通知を有効化", disable: "通知を無効化", back: "前のステップ", next: "次のステップ", cancel: "キャンセル", save: "設定を保存", saveEnable: "保存して有効化",
    useCurrent: "このチャンネルを使用", useDm: "DMを使用", mentionOn: "メンション：オン", mentionOff: "メンション：オフ", custom: "カスタム", customTime: "時間を入力", customValue: "数値を入力", customTimeTarget: "時間と目標を入力",
    vitality: "本日の活躍度", scratch: "スクラッチ", vhs: "ビデオ屋", bounty: "懸賞依頼", weeklyPoints: "週間ポイント", eventRewards: "イベント報酬",
    modeOff: "オフ", modeTime: "満充電までの時間", modeAmount: "現在の電量", chooseMode: "バッテリーモードを選択", chooseValue: "数値を選択", chooseHours: "通知時刻を選択", chooseTarget: "ポイント目標を選択", chooseChannel: "別のチャンネルを選択",
    customEnergyTitle: "バッテリー通知を入力", customDailyTitle: "デイリー時刻を入力", customWeeklyTitle: "週間設定を入力", customEventTitle: "イベント時刻を入力",
    energyInput: "時間（15分～12時間）", energyAmountInput: "バッテリー値（1～240）", durationExample: "例：30分、1時間", dailyInput: "リセットまで（1～12時間）", weeklyHoursInput: "リセットまで（1時間～7日）", weeklyTargetInput: "ポイント目標（1～2100）", eventInput: "終了まで（1時間～7日）",
    expired: "設定セッションの期限が切れました。`/settings` をもう一度実行してください。", notOwner: "この設定を開いたユーザーだけが操作できます。", invalidChannel: "このチャンネルは使用できません。あなたとBotに閲覧・送信権限、Botにファイル添付権限が必要です。", invalidNumber: "表示範囲内の整数を入力してください。", invalidDuration: "表示範囲内の時間を入力してください（例：`30分`、`1時間`）。", beforeReset: "リセットまで", beforeEnd: "終了まで", pointUnit: "ポイント", energyUnit: "エネルギー", noTriggers: "保存前に少なくとも1つの通知を有効にしてください。", noDestination: "保存前に通知先を選んでください。", saved: "通知設定を保存しました。", cancelled: "設定をキャンセルしました。変更は保存されていません。",
  },
  kr: {
    title: "실시간 메모 알림", homeDescription: "현재 설정을 확인·편집하거나 알림을 켜고 끕니다.",
    newDescription: "6개의 짧은 단계를 완료하세요. 마지막 확인 전에는 저장되지 않습니다.",
    steps: ["알림 방법 선택", "배터리 알림 설정", "일일 임무 알림 설정", "주간 임무 알림 설정", "이벤트 알림 설정", "알림 설정 확인"],
    stepDescriptions: ["알림 위치와 멘션 여부를 선택합니다.", "배터리 알림 조건을 선택합니다.", "일일 항목과 알림 시간을 선택합니다.", "주간 항목, 시간, 포인트 목표를 선택합니다.", "이벤트 보상 확인 여부와 시간을 선택합니다.", "저장하기 전에 모든 설정을 확인합니다."],
    stepLabel: "단계", sectionDestination: "알림 위치", sectionMention: "멘션 설정", sectionCondition: "알림 조건", sectionItems: "알림 항목", sectionTime: "알림 시간", sectionTarget: "포인트 목표",
    status: "상태", destination: "알림 위치", mention: "멘션", energy: "배터리", daily: "일일", weekly: "주간", event: "이벤트",
    enabled: "활성화", disabled: "비활성화", yes: "예", no: "아니요", notSet: "설정 안 됨", dm: "개인 메시지", currentChannel: "현재 채널",
    edit: "설정 편집", enable: "알림 켜기", disable: "알림 끄기", back: "이전 단계", next: "다음 단계", cancel: "취소", save: "설정 저장", saveEnable: "저장하고 켜기",
    useCurrent: "현재 채널 사용", useDm: "DM 사용", mentionOn: "멘션: 켬", mentionOff: "멘션: 끔", custom: "직접 입력", customTime: "시간 직접 입력", customValue: "수치 직접 입력", customTimeTarget: "시간과 목표 직접 입력",
    vitality: "오늘 활약도", scratch: "스크래치", vhs: "비디오 가게", bounty: "현상 의뢰", weeklyPoints: "주간 포인트", eventRewards: "이벤트 보상",
    modeOff: "끄기", modeTime: "완충까지 시간", modeAmount: "현재 배터리 수치", chooseMode: "배터리 모드 선택", chooseValue: "수치 선택", chooseHours: "알림 시간 선택", chooseTarget: "포인트 목표 선택", chooseChannel: "다른 채널 선택",
    customEnergyTitle: "배터리 알림 직접 입력", customDailyTitle: "일일 시간 입력", customWeeklyTitle: "주간 설정 입력", customEventTitle: "이벤트 시간 입력",
    energyInput: "시간(15분~12시간)", energyAmountInput: "배터리 수치(1~240)", durationExample: "예: 30분, 1시간", dailyInput: "초기화 전(1~12시간)", weeklyHoursInput: "초기화 전(1시간~7일)", weeklyTargetInput: "포인트 목표(1~2100)", eventInput: "종료 전(1시간~7일)",
    expired: "설정 세션이 만료되었습니다. `/settings`를 다시 실행하세요.", notOwner: "이 설정을 연 사용자만 조작할 수 있습니다.", invalidChannel: "이 채널을 사용할 수 없습니다. 사용자와 Bot에 보기·보내기 권한, Bot에 파일 첨부 권한이 필요합니다.", invalidNumber: "표시된 범위 안의 정수를 입력하세요.", invalidDuration: "표시된 범위 안의 시간을 입력하세요. 예: `30분`, `1시간`.", beforeReset: "초기화까지", beforeEnd: "종료까지", pointUnit: "포인트", energyUnit: "에너지", noTriggers: "저장하기 전에 하나 이상의 알림을 켜세요.", noDestination: "저장하기 전에 알림 위치를 선택하세요.", saved: "알림 설정을 저장했습니다.", cancelled: "설정을 취소했습니다. 변경 사항은 저장되지 않았습니다.",
  },
  fr: {
    title: "Rappels des notes en temps réel", homeDescription: "Consultez ou modifiez vos réglages, puis activez ou désactivez les rappels.",
    newDescription: "Suivez ces six étapes. Rien n’est enregistré avant la confirmation finale.",
    steps: ["Choisir la destination", "Régler le rappel d’énergie", "Régler les rappels quotidiens", "Régler les rappels hebdomadaires", "Régler les rappels d’événement", "Vérifier les rappels"],
    stepDescriptions: ["Choisissez la destination et la mention.", "Choisissez le fonctionnement du rappel d’énergie.", "Choisissez les tâches quotidiennes et l’heure du rappel.", "Choisissez les tâches hebdomadaires, l’heure et l’objectif.", "Choisissez le suivi des récompenses d’événement.", "Vérifiez tous les réglages avant d’enregistrer."],
    stepLabel: "Étape", sectionDestination: "Destination", sectionMention: "Réglage de la mention", sectionCondition: "Condition du rappel", sectionItems: "Éléments à rappeler", sectionTime: "Délai du rappel", sectionTarget: "Objectif de points",
    status: "Statut", destination: "Destination", mention: "Mention", energy: "Énergie", daily: "Quotidien", weekly: "Hebdomadaire", event: "Événements",
    enabled: "Activé", disabled: "Désactivé", yes: "Oui", no: "Non", notSet: "Non défini", dm: "Message privé", currentChannel: "Salon actuel",
    edit: "Modifier", enable: "Activer les rappels", disable: "Désactiver les rappels", back: "Étape précédente", next: "Étape suivante", cancel: "Annuler", save: "Enregistrer", saveEnable: "Enregistrer et activer",
    useCurrent: "Utiliser ce salon", useDm: "Utiliser les MP", mentionOn: "Mention : oui", mentionOff: "Mention : non", custom: "Personnalisé", customTime: "Délai personnalisé", customValue: "Valeur personnalisée", customTimeTarget: "Délai et objectif personnalisés",
    vitality: "Activité quotidienne", scratch: "Carte à gratter", vhs: "Vidéoclub", bounty: "Primes", weeklyPoints: "Points hebdomadaires", eventRewards: "Récompenses d’événement",
    modeOff: "Désactivé", modeTime: "Temps avant recharge", modeAmount: "Énergie actuelle", chooseMode: "Choisir le mode d’énergie", chooseValue: "Choisir une valeur", chooseHours: "Choisir l’heure du rappel", chooseTarget: "Choisir l’objectif", chooseChannel: "Choisir un autre salon",
    customEnergyTitle: "Rappel d’énergie personnalisé", customDailyTitle: "Délai quotidien personnalisé", customWeeklyTitle: "Réglages hebdomadaires", customEventTitle: "Délai d’événement personnalisé",
    energyInput: "Délai (15 minutes–12 heures)", energyAmountInput: "Énergie (1–240)", durationExample: "ex. 30 minutes, 1 heure", dailyInput: "Avant réinit. (1–12 heures)", weeklyHoursInput: "Avant réinit. (1 heure–7 jours)", weeklyTargetInput: "Objectif de points (1–2100)", eventInput: "Avant la fin (1 heure–7 jours)",
    expired: "Cette session a expiré. Relancez `/settings`.", notOwner: "Seul l’utilisateur ayant ouvert ces réglages peut les utiliser.", invalidChannel: "Ce salon est inutilisable. Vous et le bot devez pouvoir le voir et y écrire ; le bot doit aussi pouvoir joindre des fichiers.", invalidNumber: "Saisissez un nombre entier dans la plage indiquée.", invalidDuration: "Saisissez une durée valide dans la plage indiquée, par exemple `30 minutes` ou `1 heure`.", beforeReset: "Avant réinitialisation", beforeEnd: "Avant la fin", pointUnit: "pts", energyUnit: "énergie", noTriggers: "Activez au moins un rappel avant d’enregistrer.", noDestination: "Choisissez une destination avant d’enregistrer.", saved: "Réglages des rappels enregistrés.", cancelled: "Configuration annulée. Aucun changement enregistré.",
  },
  vi: {
    title: "Nhắc nhở ghi chú thời gian thực", homeDescription: "Xem hoặc chỉnh sửa cài đặt, bật hay tắt nhắc nhở.",
    newDescription: "Hoàn thành sáu bước ngắn. Chỉ lưu sau khi bạn xác nhận cuối cùng.",
    steps: ["Chọn cách nhận", "Đặt nhắc nhở năng lượng", "Đặt nhắc nhở hằng ngày", "Đặt nhắc nhở hằng tuần", "Đặt nhắc nhở sự kiện", "Xác nhận cài đặt"],
    stepDescriptions: ["Chọn nơi gửi và có nhắc tên bạn hay không.", "Chọn cách nhắc năng lượng.", "Chọn nhiệm vụ hằng ngày và thời điểm nhắc.", "Chọn nhiệm vụ tuần, thời điểm và mục tiêu điểm.", "Chọn kiểm tra phần thưởng sự kiện và thời điểm nhắc.", "Kiểm tra mọi cài đặt trước khi lưu."],
    stepLabel: "Bước", sectionDestination: "Nơi nhận thông báo", sectionMention: "Cài đặt nhắc tên", sectionCondition: "Điều kiện nhắc", sectionItems: "Mục cần nhắc", sectionTime: "Thời gian nhắc", sectionTarget: "Mục tiêu điểm",
    status: "Trạng thái", destination: "Nơi nhận", mention: "Nhắc tên", energy: "Năng lượng", daily: "Hằng ngày", weekly: "Hằng tuần", event: "Sự kiện",
    enabled: "Đã bật", disabled: "Đã tắt", yes: "Có", no: "Không", notSet: "Chưa đặt", dm: "Tin nhắn riêng", currentChannel: "Kênh hiện tại",
    edit: "Chỉnh sửa", enable: "Bật nhắc nhở", disable: "Tắt nhắc nhở", back: "Bước trước", next: "Bước tiếp theo", cancel: "Hủy", save: "Lưu cài đặt", saveEnable: "Lưu và bật",
    useCurrent: "Dùng kênh này", useDm: "Dùng tin nhắn riêng", mentionOn: "Nhắc tên: bật", mentionOff: "Nhắc tên: tắt", custom: "Tùy chỉnh", customTime: "Tùy chỉnh thời gian", customValue: "Tùy chỉnh giá trị", customTimeTarget: "Tùy chỉnh thời gian và mục tiêu",
    vitality: "Hoạt động hôm nay", scratch: "Thẻ cào", vhs: "Tiệm băng hình", bounty: "Ủy thác treo thưởng", weeklyPoints: "Điểm tuần", eventRewards: "Thưởng sự kiện",
    modeOff: "Tắt", modeTime: "Thời gian đến khi đầy", modeAmount: "Năng lượng hiện tại", chooseMode: "Chọn chế độ năng lượng", chooseValue: "Chọn giá trị", chooseHours: "Chọn thời điểm nhắc", chooseTarget: "Chọn mục tiêu điểm", chooseChannel: "Chọn kênh khác",
    customEnergyTitle: "Nhắc năng lượng tùy chỉnh", customDailyTitle: "Thời gian ngày tùy chỉnh", customWeeklyTitle: "Cài đặt tuần tùy chỉnh", customEventTitle: "Thời gian sự kiện tùy chỉnh",
    energyInput: "Thời gian (15 phút–12 giờ)", energyAmountInput: "Năng lượng (1–240)", durationExample: "vd. 30 phút, 1 giờ", dailyInput: "Trước đặt lại (1–12 giờ)", weeklyHoursInput: "Trước đặt lại (1 giờ–7 ngày)", weeklyTargetInput: "Mục tiêu điểm (1–2100)", eventInput: "Trước kết thúc (1 giờ–7 ngày)",
    expired: "Phiên cài đặt đã hết hạn. Hãy chạy lại `/settings`.", notOwner: "Chỉ người mở cài đặt này mới có thể thao tác.", invalidChannel: "Không thể dùng kênh này. Bạn và bot phải xem, gửi tin nhắn được; bot cũng cần quyền đính kèm tệp.", invalidNumber: "Hãy nhập số nguyên trong phạm vi hiển thị.", invalidDuration: "Hãy nhập thời gian trong phạm vi hiển thị, ví dụ `30 phút` hoặc `1 giờ`.", beforeReset: "Trước khi đặt lại", beforeEnd: "Trước khi kết thúc", pointUnit: "điểm", energyUnit: "năng lượng", noTriggers: "Hãy bật ít nhất một nhắc nhở trước khi lưu.", noDestination: "Hãy chọn nơi nhận trước khi lưu.", saved: "Đã lưu cài đặt nhắc nhở.", cancelled: "Đã hủy cài đặt. Không có thay đổi nào được lưu.",
  },
};

export function toReminderLocale(value: unknown): ReminderLocale {
  const locale = String(value ?? "").toLowerCase();
  if (locale === "tw" || locale.startsWith("zh-tw")) return "tw";
  if (locale === "cn" || locale.startsWith("zh")) return "cn";
  if (locale === "jp" || locale.startsWith("ja")) return "jp";
  if (locale === "kr" || locale.startsWith("ko")) return "kr";
  if (locale.startsWith("fr")) return "fr";
  if (locale.startsWith("vi")) return "vi";
  return "en";
}
