import { locales, uiLocale } from "./presentation.js";

const copy = {
  mimo: [
    "Automatically completes supported Mimo tasks, earns points, then exchanges your chosen rewards for the selected UID. Set the account, rewards and priority first, then Enable. Enable/Disable takes effect immediately.",
    "自動完成支援的 Mimo 任務取得積分，再依順序兌換所選獎勵給指定 UID。先設定領獎帳號、獎勵與順位，最後按「啟用」。啟用／停用會立即生效。",
    "自动完成支持的 Mimo 任务获取积分，再按顺序兑换所选奖励给指定 UID。先设置领奖账号、奖励和顺序，最后按「启用」。启用／停用立即生效。",
    "対応する Mimo タスクでポイントを獲得し、選んだ UID に優先順で報酬を交換します。アカウントと報酬を設定してから有効にしてください。有効・無効は即時反映されます。",
    "지원하는 Mimo 임무로 포인트를 모아 선택한 UID에 우선순위대로 보상을 교환합니다. 계정과 보상을 설정한 뒤 활성화하세요. 활성화·비활성화는 즉시 적용됩니다.",
    "Accomplit les tâches Mimo prises en charge, puis échange les points contre les récompenses choisies pour l’UID sélectionné. Réglez le compte et les priorités, puis activez. Activer/désactiver prend effet immédiatement.",
    "Tự hoàn thành nhiệm vụ Mimo được hỗ trợ, tích điểm rồi đổi thưởng theo ưu tiên cho UID đã chọn. Đặt tài khoản và phần thưởng trước khi bật. Bật/tắt có hiệu lực ngay.",
  ],
  account: ["Choose the game UID that will receive rewards. Save before enabling automation.", "選擇要收到獎勵的遊戲 UID，確認暱稱與 UID 後儲存，再啟用自動執行。", "选择接收奖励的游戏 UID，确认昵称与 UID 后保存，再启用自动执行。", "報酬を受け取る UID を選び、確認して保存してください。", "보상을 받을 게임 UID를 확인한 뒤 저장하세요.", "Choisissez et vérifiez l’UID destinataire avant d’enregistrer.", "Chọn và kiểm tra UID nhận thưởng trước khi lưu."],
  rewards: ["Select one or more rewards in the menu. Polychrome is the default; only selected rewards are exchanged. Prices and stock depend on the shop.", "在下方選單勾選一項或多項獎勵，至少保留一項；預設為菲林，只會兌換你勾選的項目。所需積分與庫存以商店為準。", "在下方菜单勾选一项或多项奖励，至少保留一项；默认为菲林，只兑换勾选项目。积分和库存以商店为准。", "メニューで1つ以上の報酬を選択します。初期設定はポリクロームです。価格と在庫はショップに従います。", "메뉴에서 보상을 하나 이상 선택하세요. 기본은 폴리크롬이며 선택한 보상만 교환합니다. 가격과 재고는 상점 기준입니다.", "Choisissez au moins une récompense. Le polychrome est sélectionné par défaut. Seuls vos choix sont échangés, selon les prix et stocks de la boutique.", "Chọn ít nhất một phần thưởng. Mặc định là Polychrome. Chỉ đổi mục đã chọn, theo giá và tồn kho của cửa hàng."],
  priority: ["Select a reward in the menu, then Move up/down. Number 1 has the highest priority. Points are reserved for higher-priority rewards.", "先在選單選一項獎勵，再按「上移／下移」。第 1 順位最優先；系統會優先保留積分給較高順位的獎勵。", "先在菜单选一项奖励，再按「上移／下移」。第 1 项最优先，积分优先保留给高顺序奖励。", "報酬を選んで「上へ・下へ」で並べ替えます。1が最優先で、上位の報酬用にポイントを確保します。", "보상을 선택한 뒤 위·아래로 이동하세요. 1번이 최우선이며 상위 보상을 위해 포인트를 남깁니다.", "Choisissez une récompense puis déplacez-la. Le numéro 1 est prioritaire ; les points sont réservés aux priorités supérieures.", "Chọn phần thưởng rồi di chuyển lên/xuống. Số 1 ưu tiên cao nhất; giữ điểm cho phần thưởng ưu tiên cao."],
  notification: ["Choose Off, DM or a server channel for result notifications. Off stops notifications only; automation can still run. For channels, also select the destination.", "選擇關閉通知、私訊或伺服器頻道。關閉只是不傳送結果通知，自動任務仍可執行；選擇頻道時，還要指定接收頻道。", "选择关闭通知、私信或服务器频道。关闭仅停止结果通知，自动任务仍可执行；选择频道后还需指定接收频道。", "結果通知をオフ・DM・チャンネルから選択します。通知オフでも自動実行は続きます。チャンネルの場合は通知先も指定します。", "결과 알림을 끄거나 DM·채널로 받으세요. 알림을 꺼도 자동 실행은 유지됩니다. 채널 선택 시 대상도 지정하세요.", "Choisissez aucune notification, un message privé ou un salon. Désactiver les notifications n’arrête pas l’automatisation. Précisez le salon si nécessaire.", "Chọn tắt, tin nhắn riêng hoặc kênh nhận kết quả. Tắt thông báo không tắt tự động. Nếu dùng kênh, chọn kênh nhận."],
  public: ["When off, others cannot view your signal archives; banner cards hide resources and pity.", "關閉後，他人無法查看你的調頻封存，卡池也會隱藏資源與保底資訊。", "关闭后，他人无法查看你的调频存档，卡池也会隐藏资源和保底信息。", "オフにすると他の人は保存記録を閲覧できず、バナーの資源・天井情報も非表示になります。", "끄면 다른 사람에게 기록을 비공개로 하고 배너의 재화와 천장 정보를 숨깁니다.", "Désactivé : archives privées, ressources et garantie masquées sur les bannières.", "Khi tắt, người khác không xem được bản lưu; ẩn tài nguyên và bảo hiểm trên thẻ banner."],
  archive: ["Applies to all current and future linked ZZZ accounts. Turning this off keeps existing archives.", "套用至所有已綁定及之後綁定的 ZZZ 帳號。關閉不會刪除已有的封存紀錄。", "适用于所有已绑定及之后绑定的 ZZZ 账号。关闭不会删除已有存档。", "現在と今後の連携アカウントに適用します。オフでも既存の保存記録は残ります。", "현재와 이후 연결한 ZZZ 계정에 적용됩니다. 꺼도 기존 기록은 유지됩니다.", "S’applique aux comptes ZZZ liés, présents et futurs. Les archives existantes sont conservées si désactivé.", "Áp dụng cho mọi tài khoản ZZZ đã và sẽ liên kết. Tắt không xóa bản lưu hiện có."],
} satisfies Record<string, readonly string[]>;

export function settingGuidance(locale: unknown, key: keyof typeof copy): string {
  return copy[key][locales.indexOf(uiLocale(locale))]!;
}
