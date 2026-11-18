import type { GachaChannelCategory } from "./gachaArchive.js";
import { normalizeZzzLocale } from "./canvasFonts.js";

export interface NoteText {
  title: string; energy: string; full: string; activity: string; vitality: string; scratch: string;
  vhs: string; bounty: string; weekly: string; done: string; notDone: string; doing: string;
  claim: string; refresh: string; opens: string; today: string; tomorrow: string; fullSuffix: string;
  lessMinute: string; day: string; hour: string; minute: string;
  priority: string; urgent: string; soon: string; resets: string; ends: string; restores: string; ended: string; threshold: string;
}

export interface SignalText {
  recordTitle: string; notSynced: string; syncFailed: string; updatedAt: string; total: string;
  polychrome: string; encrypted: string;
  original: string; boopon: string;
  estimated: string; noS: string; sRecords: string;
  noSForBanner: string; allRecords: string; noRecords: string; unclassified: string;
  banner: string; sourcePlaceholder: string; official: string; manual: string; categoryPlaceholder: string;
  archived: string; empty: string; bannerPlaceholder: string; newer: string; older: string;
  all: string; previous: string; next: string; importUrl: string; howUrl: string;
  pityCycles: string; legendS: string; legendA: string; legendB: string;
  pageOf: string; bigGuarantee: string;
  homeTitle: string; allChannels: string; monochrome: string; pullsAvailable: string; pullUnit: string; sCountOf: string; sCount: string; toHardPity: string; smallGuarantee: string; upOverS: string; averageUpCost: string; averageSShort: string; pityNow: string; viewWall: string; viewVersions: string; newestFirst: string; recordsSince: string; ongoing: string; noSInVersion: string; continued: string; upCountOf: string; homeOption: string;
}

const NOTE_EN: NoteText = {
  title: "Real-Time Notes", energy: "Battery", full: "Battery fully restored", activity: "Event Calendar",
  vitality: "Daily Activity", scratch: "Box Toy / Scratch Card / Fortune", vhs: "Video Store Management",
  bounty: "Bounty Commission Progress", weekly: "Ridu Weekly Points Earned", done: "Completed",
  notDone: "Not completed", doing: "Open for business", claim: "Claimable", refresh: " until refresh",
  opens: " until open", today: "Today ", tomorrow: "Tomorrow ", fullSuffix: " full",
  lessMinute: "<1m", day: "d", hour: "h", minute: "m",
  priority: "Do first", urgent: "Urgent", soon: "Due soon", resets: " until reset", ends: " remaining", restores: " until full", ended: "Ended", threshold: "Reminder threshold reached",
};
const SIGNAL_EN: SignalText = {
  recordTitle: "Signal Search Records", notSynced: "Not synced", syncFailed: "Sync failed", updatedAt: "Updated",
  total: "Total Pulls", 
  polychrome: "Polychrome", encrypted: "Encrypted Master Tape", original: "Master Tape", boopon: "Boopon",
  
  estimated: "Estimated", noS: "No S-rank records", sRecords: "S-Rank Records",
  noSForBanner: "No S-rank records for this banner",
  allRecords: "All Records", noRecords: "No records for this banner",
  unclassified: "Unclassified", banner: "Banner", sourcePlaceholder: "Select record source",
  official: "Official Archive", manual: "Manual Import", categoryPlaceholder: "Select channel type",
  archived: "Archived records", empty: "No records", bannerPlaceholder: "Select banner", newer: "Newer",
  older: "Older", all: "All Records", previous: "Previous", next: "Next",
  importUrl: "Import URL", howUrl: "How to get URL",
  pityCycles: "Pity Cycles", legendS: "S-Rank", legendA: "A-Rank", legendB: "B-Rank", pageOf: "Page {page} / {pages}", bigGuarantee: "UP Guaranteed",
  homeTitle: "Signal Overview",
  allChannels: "All Channels",
  monochrome: "Monochrome",
  pullsAvailable: "Limited Pulls Available",
  pullUnit: "pulls",
  sCountOf: "S-Rank: {n}",
  sCount: "S Count",
  toHardPity: "{n} pulls until guarantee",
  smallGuarantee: "Not Guaranteed",
  upOverS: "UP / S",
  averageUpCost: "Avg. Pulls per UP",
  averageSShort: "Avg. Pulls per S",
  pityNow: "Current Pity",
  viewWall: "S-Rank Overview",
  viewVersions: "Version Records",
  newestFirst: "Newest to Oldest",
  recordsSince: "Records since {date}",
  ongoing: "Ongoing",
  noSInVersion: "No S-Rank Obtained",
  continued: "(cont.)",
  upCountOf: "UP: {n}",
  homeOption: "All Channels Overview",
};

const NOTE: Record<string, Partial<NoteText>> = {
  tw: { priority: "先處理", urgent: "緊急", soon: "留意", resets: "後重置", ends: "後結束", restores: "後回滿", ended: "已結束", threshold: "已達提醒門檻", title: "即時便箋", energy: "電量", full: "電量已充滿", activity: "活動日曆", vitality: "今日活躍度", scratch: "餅鋪盒玩/刮刮樂/占卜", vhs: "錄影帶店經營", bounty: "懸賞委託進度", weekly: "麗都週記獲得積分", done: "已完成", notDone: "未完成", doing: "正在營業", claim: "待領取", refresh: "後更新", opens: "後開放", today: "今日", tomorrow: "明日", fullSuffix: "回滿", lessMinute: "少於1分鐘", day: "天", hour: "小時", minute: "分" },
  cn: { priority: "先处理", urgent: "紧急", soon: "留意", resets: "后重置", ends: "后结束", restores: "后回满", ended: "已结束", threshold: "已达提醒门槛", title: "实时便笺", energy: "电量", full: "电量已充满", activity: "活动日历", vitality: "今日活跃度", scratch: "饼铺盒玩/刮刮乐/占卜", vhs: "录像带店经营", bounty: "悬赏委托进度", weekly: "丽都周记获得积分", done: "已完成", notDone: "未完成", doing: "正在营业", claim: "待领取", refresh: "后更新", opens: "后开放", today: "今日", tomorrow: "明日", fullSuffix: "回满", lessMinute: "少于1分钟", day: "天", hour: "小时", minute: "分" },
  jp: { priority: "優先", urgent: "至急", soon: "まもなく", resets: "後にリセット", ends: "後に終了", restores: "後に全回復", ended: "終了", threshold: "通知条件に到達", title: "リアルタイムノート", energy: "バッテリー", full: "バッテリー全回復", activity: "イベントカレンダー", vitality: "本日の活躍度", scratch: "ボックス玩具/スクラッチ/占い", vhs: "ビデオ屋経営", bounty: "懸賞依頼進捗", weekly: "麗都ウィークリーPt", done: "完了", notDone: "未完了", doing: "営業中", claim: "受取可能", refresh: "後に更新", opens: "後に開放", today: "今日 ", tomorrow: "明日 ", fullSuffix: " 全回復", lessMinute: "1分未満", day: "日", hour: "時間", minute: "分" },
  kr: { priority: "우선 처리", urgent: "긴급", soon: "곧 마감", resets: " 후 초기화", ends: " 후 종료", restores: " 후 완충", ended: "종료", threshold: "알림 기준 도달", title: "실시간 메모", energy: "배터리", full: "배터리 완충", activity: "이벤트 캘린더", vitality: "오늘의 활약도", scratch: "뽑기/스크래치/운세", vhs: "비디오 가게 경영", bounty: "현상 의뢰 진행도", weekly: "리두 주간 포인트", done: "완료", notDone: "미완료", doing: "영업 중", claim: "수령 가능", refresh: " 후 갱신", opens: " 후 개방", today: "오늘 ", tomorrow: "내일 ", fullSuffix: " 완충", lessMinute: "1분 미만", day: "일", hour: "시간", minute: "분" },
  fr: { priority: "En priorité", urgent: "Urgent", soon: "Bientôt", resets: " avant réinitialisation", ends: " avant la fin", restores: " avant recharge complète", ended: "Terminé", threshold: "Seuil de rappel atteint", title: "Notes en temps réel", energy: "Batterie", full: "Batterie pleine", activity: "Calendrier des événements", vitality: "Activité quotidienne", scratch: "Jouet / Gratte-gratte / Divination", vhs: "Gestion du vidéoclub", bounty: "Progression des primes", weekly: "Points hebdomadaires de Ridu", done: "Terminé", notDone: "Non terminé", doing: "Ouvert", claim: "À récupérer", refresh: " avant actualisation", opens: " avant ouverture", today: "Aujourd'hui ", tomorrow: "Demain ", fullSuffix: " pleine", lessMinute: "<1 min", day: "j", hour: "h", minute: "min" },
  vi: { priority: "Ưu tiên", urgent: "Khẩn cấp", soon: "Sắp đến hạn", resets: " đến khi đặt lại", ends: " đến khi kết thúc", restores: " đến khi đầy", ended: "Đã kết thúc", threshold: "Đã đạt ngưỡng nhắc", title: "Ghi chú thời gian thực", energy: "Điện lượng", full: "Điện lượng đã đầy", activity: "Lịch sự kiện", vitality: "Năng động hôm nay", scratch: "Đồ chơi / Thẻ cào / Bói", vhs: "Kinh doanh tiệm băng hình", bounty: "Tiến độ ủy thác", weekly: "Điểm tuần Ridu", done: "Đã hoàn thành", notDone: "Chưa hoàn thành", doing: "Đang kinh doanh", claim: "Có thể nhận", refresh: " đến khi làm mới", opens: " đến khi mở", today: "Hôm nay ", tomorrow: "Ngày mai ", fullSuffix: " đầy", lessMinute: "<1 phút", day: "ngày", hour: "giờ", minute: "phút" },
};

const SIGNAL: Record<string, Partial<SignalText>> = {
  tw: { recordTitle: "調頻紀錄", notSynced: "尚未同步", syncFailed: "同步失敗", updatedAt: "更新於", total: "總抽數", polychrome: "菲林", encrypted: "加密母帶", original: "原裝母帶", boopon: "邦布券", estimated: "推算", noS: "尚無 S 級紀錄", sRecords: "S 級紀錄", noSForBanner: "此卡池尚無 S 級紀錄", allRecords: "全部紀錄", noRecords: "此卡池尚無紀錄", unclassified: "未分類", banner: "卡池", sourcePlaceholder: "選擇紀錄來源", official: "官方封存", manual: "手動匯入", categoryPlaceholder: "選擇頻道類型", archived: "已有封存紀錄", empty: "尚無紀錄", bannerPlaceholder: "選擇單期卡池", newer: "較新卡池", older: "較舊卡池", all: "全部紀錄", previous: "上一頁", next: "下一頁", importUrl: "匯入 URL", howUrl: "如何取得 URL", pityCycles: "保底週期", legendS: "S 級", legendA: "A 級", legendB: "B 級", pageOf: "第 {page} / {pages} 頁", bigGuarantee: "UP 保底", homeTitle: "調頻總覽", allChannels: "全頻道", monochrome: "菲林底片", pullsAvailable: "限定頻道可調頻次數", pullUnit: "抽", sCountOf: "S 級 {n} 個", sCount: "S 數量", toHardPity: "距離保底尚餘 {n} 抽", smallGuarantee: "尚未保底", upOverS: "UP / S", averageUpCost: "UP 平均抽數", averageSShort: "S 級平均抽數", pityNow: "目前保底進度", viewWall: "S 級一覽", viewVersions: "版本紀錄", newestFirst: "由新至舊", recordsSince: "紀錄起始：{date}", ongoing: "進行中", noSInVersion: "未獲得 S 級", continued: "（續）", upCountOf: "UP {n} 個", homeOption: "全頻道總覽" },
  cn: { recordTitle: "调频记录", notSynced: "尚未同步", syncFailed: "同步失败", updatedAt: "更新于", total: "总抽数", polychrome: "菲林", encrypted: "加密母带", original: "原装母带", boopon: "邦布券", estimated: "推算", noS: "暂无 S 级记录", sRecords: "S 级记录", noSForBanner: "此卡池暂无 S 级记录", allRecords: "全部记录", noRecords: "此卡池暂无记录", unclassified: "未分类", banner: "卡池", sourcePlaceholder: "选择记录来源", official: "官方封存", manual: "手动导入", categoryPlaceholder: "选择频道类型", archived: "已有封存记录", empty: "暂无记录", bannerPlaceholder: "选择单期卡池", newer: "较新卡池", older: "较旧卡池", all: "全部记录", previous: "上一页", next: "下一页", importUrl: "导入 URL", howUrl: "如何取得 URL", pityCycles: "保底周期", legendS: "S 级", legendA: "A 级", legendB: "B 级", pageOf: "第 {page} / {pages} 页", bigGuarantee: "UP 保底", homeTitle: "调频总览", allChannels: "全频道", monochrome: "菲林底片", pullsAvailable: "限定频道可调频次数", pullUnit: "抽", sCountOf: "S 级 {n} 个", sCount: "S 数量", toHardPity: "距离保底尚余 {n} 抽", smallGuarantee: "尚未保底", upOverS: "UP / S", averageUpCost: "UP 平均抽数", averageSShort: "S 级平均抽数", pityNow: "当前保底进度", viewWall: "S 级一览", viewVersions: "版本记录", newestFirst: "由新至旧", recordsSince: "记录起始：{date}", ongoing: "进行中", noSInVersion: "未获得 S 级", continued: "（续）", upCountOf: "UP {n} 个", homeOption: "全频道总览" },
  jp: { recordTitle: "変調記録", notSynced: "未同期", syncFailed: "同期失敗", updatedAt: "更新", total: "総抽選数", polychrome: "ポリクローム", encrypted: "暗号化マスターテープ", original: "未加工マスターテープ", boopon: "ボンプチケット", estimated: "推定", noS: "Sランク記録なし", sRecords: "Sランク記録", noSForBanner: "このチャンネルにSランク記録はありません", allRecords: "全記録", noRecords: "記録がありません", unclassified: "未分類", banner: "チャンネル", sourcePlaceholder: "記録元を選択", official: "公式アーカイブ", manual: "手動インポート", categoryPlaceholder: "チャンネル種類を選択", archived: "保存済み", empty: "記録なし", bannerPlaceholder: "期間を選択", newer: "新しい期間", older: "古い期間", all: "全記録", previous: "前へ", next: "次へ", importUrl: "URLをインポート", howUrl: "URLの取得方法", pityCycles: "天井サイクル", legendS: "Sランク", legendA: "Aランク", legendB: "Bランク", pageOf: "{page} / {pages} ページ", bigGuarantee: "UP確定", homeTitle: "変調総覧", allChannels: "全チャンネル", monochrome: "モノクローム", pullsAvailable: "限定チャンネル変調可能回数", pullUnit: "回", sCountOf: "Sランク {n} 個", sCount: "Sランク数", toHardPity: "天井まで残り {n} 回", smallGuarantee: "未確定", upOverS: "UP / S", averageUpCost: "UP平均回数", averageSShort: "Sランク平均回数", pityNow: "現在の天井進捗", viewWall: "Sランク一覧", viewVersions: "バージョン別記録", newestFirst: "新しい順", recordsSince: "記録開始：{date}", ongoing: "進行中", noSInVersion: "Sランク未獲得", continued: "（続き）", upCountOf: "UP {n} 個", homeOption: "全チャンネル総覧" },
  kr: { recordTitle: "변조 기록", notSynced: "동기화 안 됨", syncFailed: "동기화 실패", updatedAt: "업데이트", total: "총 뽑기", polychrome: "폴리크롬", encrypted: "암호화 마스터 테이프", original: "마스터 테이프", boopon: "본부 티켓", estimated: "추정", noS: "S급 기록 없음", sRecords: "S급 기록", noSForBanner: "이 채널에 S급 기록이 없습니다", allRecords: "전체 기록", noRecords: "기록 없음", unclassified: "미분류", banner: "채널", sourcePlaceholder: "기록 출처 선택", official: "공식 보관", manual: "수동 가져오기", categoryPlaceholder: "채널 유형 선택", archived: "보관 기록 있음", empty: "기록 없음", bannerPlaceholder: "기간 선택", newer: "최신", older: "이전", all: "전체 기록", previous: "이전", next: "다음", importUrl: "URL 가져오기", howUrl: "URL 얻는 법", pityCycles: "천장 주기", legendS: "S급", legendA: "A급", legendB: "B급", pageOf: "{page} / {pages} 페이지", bigGuarantee: "UP 확정", homeTitle: "변조 총람", allChannels: "전체 채널", monochrome: "모노크롬", pullsAvailable: "한정 채널 변조 가능 횟수", pullUnit: "회", sCountOf: "S급 {n}개", sCount: "S 개수", toHardPity: "천장까지 {n}회 남음", smallGuarantee: "미확정", upOverS: "UP / S", averageUpCost: "UP 평균 횟수", averageSShort: "S급 평균 횟수", pityNow: "현재 천장 진행도", viewWall: "S급 목록", viewVersions: "버전별 기록", newestFirst: "최신순", recordsSince: "기록 시작: {date}", ongoing: "진행 중", noSInVersion: "S급 미획득", continued: "(이어짐)", upCountOf: "UP {n}개", homeOption: "전체 채널 총람" },
  fr: { recordTitle: "Historique de recherche", notSynced: "Non synchronisé", syncFailed: "Échec de synchronisation", updatedAt: "Mis à jour", total: "Tirages totaux", polychrome: "Polychrome", encrypted: "Master Bande cryptée", original: "Master Bande", boopon: "Boopon", estimated: "Estimé", noS: "Aucun rang S", sRecords: "Historique rang S", noSForBanner: "Aucun rang S pour cette bannière", allRecords: "Tous les tirages", noRecords: "Aucun tirage", unclassified: "Non classé", banner: "Bannière", sourcePlaceholder: "Choisir la source", official: "Archive officielle", manual: "Import manuel", categoryPlaceholder: "Choisir le canal", archived: "Archive disponible", empty: "Aucun historique", bannerPlaceholder: "Choisir la bannière", newer: "Plus récent", older: "Plus ancien", all: "Tous les tirages", previous: "Précédent", next: "Suivant", importUrl: "Importer URL", howUrl: "Obtenir l'URL", pityCycles: "Cycles de pitié", legendS: "Rang S", legendA: "Rang A", legendB: "Rang B", pageOf: "Page {page} / {pages}", bigGuarantee: "UP garanti", homeTitle: "Aperçu des signaux", allChannels: "Tous les canaux", monochrome: "Monochrome", pullsAvailable: "Tirages limités disponibles", pullUnit: "tirages", sCountOf: "Rang S : {n}", sCount: "Nombre de S", toHardPity: "{n} tirages avant la garantie", smallGuarantee: "Non garanti", upOverS: "UP / S", averageUpCost: "Moy. par UP", averageSShort: "Moy. par rang S", pityNow: "Pitié actuelle", viewWall: "Aperçu des rangs S", viewVersions: "Historique par version", newestFirst: "Du plus récent au plus ancien", recordsSince: "Historique depuis le {date}", ongoing: "En cours", noSInVersion: "Aucun rang S obtenu", continued: "(suite)", upCountOf: "UP : {n}", homeOption: "Aperçu de tous les canaux" },
  vi: { recordTitle: "Lịch sử tìm kiếm", notSynced: "Chưa đồng bộ", syncFailed: "Đồng bộ thất bại", updatedAt: "Cập nhật", total: "Tổng lượt", polychrome: "Polychrome", encrypted: "Băng Mã Hóa", original: "Băng Gốc", boopon: "Vé Bangboo", estimated: "Ước tính", noS: "Chưa có S-rank", sRecords: "Lịch sử S-rank", noSForBanner: "Kênh này chưa có S-rank", allRecords: "Tất cả lịch sử", noRecords: "Chưa có lịch sử", unclassified: "Chưa phân loại", banner: "Kênh", sourcePlaceholder: "Chọn nguồn", official: "Lưu trữ chính thức", manual: "Nhập thủ công", categoryPlaceholder: "Chọn loại kênh", archived: "Đã có lưu trữ", empty: "Chưa có", bannerPlaceholder: "Chọn kỳ", newer: "Mới hơn", older: "Cũ hơn", all: "Tất cả", previous: "Trước", next: "Sau", importUrl: "Nhập URL", howUrl: "Cách lấy URL", pityCycles: "Chu kỳ bảo hiểm", legendS: "S-rank", legendA: "A-rank", legendB: "B-rank", pageOf: "Trang {page} / {pages}", bigGuarantee: "Bảo đảm UP", homeTitle: "Tổng quan tín hiệu", allChannels: "Tất cả kênh", monochrome: "Monochrome", pullsAvailable: "Lượt kênh giới hạn khả dụng", pullUnit: "lượt", sCountOf: "S-rank: {n}", sCount: "Số lượng S", toHardPity: "Còn {n} lượt đến bảo hiểm", smallGuarantee: "Chưa bảo đảm", upOverS: "UP / S", averageUpCost: "TB lượt mỗi UP", averageSShort: "TB lượt mỗi S", pityNow: "Bảo hiểm hiện tại", viewWall: "Danh sách S-rank", viewVersions: "Lịch sử theo phiên bản", newestFirst: "Từ mới đến cũ", recordsSince: "Lịch sử từ {date}", ongoing: "Đang diễn ra", noSInVersion: "Chưa nhận S-rank", continued: "(tiếp)", upCountOf: "UP: {n}", homeOption: "Tổng quan tất cả kênh" },
};

const CATEGORY: Record<string, Record<GachaChannelCategory, string>> = {
  en: { character_up: "Exclusive Channel", character_return: "Exclusive Rerun", weapon_up: "W-Engine Channel", weapon_return: "W-Engine Reverberation", standard: "Stable Channel", bangboo: "Bangboo Channel", unknown: "Unclassified" },
  tw: { character_up: "獨家頻道", character_return: "獨家重映", weapon_up: "音擎頻道", weapon_return: "音擎迴響", standard: "常駐頻道", bangboo: "邦布頻道", unknown: "未分類" },
  cn: { character_up: "独家频道", character_return: "独家重映", weapon_up: "音擎频道", weapon_return: "音擎回响", standard: "常驻频道", bangboo: "邦布频道", unknown: "未分类" },
  jp: { character_up: "独占チャンネル", character_return: "独占復刻", weapon_up: "音動機チャンネル", weapon_return: "音動機再演", standard: "常設チャンネル", bangboo: "ボンプチャンネル", unknown: "未分類" },
  kr: { character_up: "독점 채널", character_return: "독점 복각", weapon_up: "W-엔진 채널", weapon_return: "W-엔진 복각", standard: "상시 채널", bangboo: "본부 채널", unknown: "미분류" },
  fr: { character_up: "Canal exclusif", character_return: "Rediffusion exclusive", weapon_up: "Canal Amplificateur", weapon_return: "Résonance Amplificateur", standard: "Canal stable", bangboo: "Canal Bangbou", unknown: "Non classé" },
  vi: { character_up: "Kênh độc quyền", character_return: "Kênh tái diễn", weapon_up: "Kênh W-Engine", weapon_return: "W-Engine tái diễn", standard: "Kênh thường", bangboo: "Kênh Bangboo", unknown: "Chưa phân loại" },
};

export function noteText(locale?: string): NoteText { return { ...NOTE_EN, ...(NOTE[normalizeZzzLocale(locale)] ?? {}) }; }
export function signalText(locale?: string): SignalText { return { ...SIGNAL_EN, ...(SIGNAL[normalizeZzzLocale(locale)] ?? {}) }; }
export function signalCategoryText(locale: string | undefined, category: GachaChannelCategory): string {
  return (CATEGORY[normalizeZzzLocale(locale)] ?? CATEGORY.en)![category];
}
