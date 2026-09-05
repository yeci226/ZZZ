import type { GachaChannelCategory } from "./gachaArchive.js";
import { normalizeZzzLocale } from "./canvasFonts.js";

export interface NoteText {
  title: string; energy: string; full: string; activity: string; vitality: string; scratch: string;
  vhs: string; bounty: string; weekly: string; done: string; notDone: string; doing: string;
  claim: string; refresh: string; opens: string; today: string; tomorrow: string; fullSuffix: string;
  lessMinute: string; day: string; hour: string; minute: string;
}

export interface SignalText {
  recordTitle: string; notSynced: string; syncFailed: string; updatedAt: string; total: string;
  averageS: string; averageUp: string; winRate: string; polychrome: string; encrypted: string;
  original: string; boopon: string; liveResources: string; unavailable: string; currentPity: string;
  estimated: string; periodS: string; noS: string; sRecords: string; page: string; perPage10: string;
  noSForBanner: string; allRecords: string; dateRange: string; noRecords: string; unclassified: string;
  banner: string; sourcePlaceholder: string; official: string; manual: string; categoryPlaceholder: string;
  archived: string; empty: string; bannerPlaceholder: string; newer: string; older: string;
  all: string; overview: string; previous: string; next: string; importUrl: string; howUrl: string;
}

const NOTE_EN: NoteText = {
  title: "Real-Time Notes", energy: "Battery", full: "Battery fully restored", activity: "Event Calendar",
  vitality: "Daily Activity", scratch: "Box Toy / Scratch Card / Fortune", vhs: "Video Store Management",
  bounty: "Bounty Commission Progress", weekly: "Ridu Weekly Points Earned", done: "Completed",
  notDone: "Not completed", doing: "Open for business", claim: "Claimable", refresh: " until refresh",
  opens: " until open", today: "Today ", tomorrow: "Tomorrow ", fullSuffix: " full",
  lessMinute: "<1m", day: "d", hour: "h", minute: "m",
};
const SIGNAL_EN: SignalText = {
  recordTitle: "Signal Search Records", notSynced: "Not synced", syncFailed: "Sync failed", updatedAt: "Updated",
  total: "Total Pulls", averageS: "Average S Pulls", averageUp: "Average UP Pulls", winRate: "Win Rate",
  polychrome: "Polychrome", encrypted: "Encrypted Master Tape", original: "Master Tape", boopon: "Boopon",
  liveResources: "Live Signal Resources", unavailable: "Temporarily unavailable", currentPity: "Current Pity",
  estimated: "Estimated", periodS: "S-Ranks This Banner", noS: "No S-rank records", sRecords: "S-Rank Records",
  page: "Page", perPage10: "10 per page", noSForBanner: "No S-rank records for this banner",
  allRecords: "All Records", dateRange: "Date range", noRecords: "No records for this banner",
  unclassified: "Unclassified", banner: "Banner", sourcePlaceholder: "Select record source",
  official: "Official Archive", manual: "Manual Import", categoryPlaceholder: "Select channel type",
  archived: "Archived records", empty: "No records", bannerPlaceholder: "Select banner", newer: "Newer",
  older: "Older", all: "All Records", overview: "Overview", previous: "Previous", next: "Next",
  importUrl: "Import URL", howUrl: "How to get URL",
};

const NOTE: Record<string, Partial<NoteText>> = {
  tw: { title: "即時便箋", energy: "電量", full: "電量已充滿", activity: "活動日曆", vitality: "今日活躍度", scratch: "餅鋪盒玩/刮刮樂/占卜", vhs: "錄影帶店經營", bounty: "懸賞委託進度", weekly: "麗都週記獲得積分", done: "已完成", notDone: "未完成", doing: "正在營業", claim: "待領取", refresh: "後更新", opens: "後開放", today: "今日", tomorrow: "明日", fullSuffix: "回滿", lessMinute: "少於1分鐘", day: "天", hour: "小時", minute: "分" },
  cn: { title: "实时便笺", energy: "电量", full: "电量已充满", activity: "活动日历", vitality: "今日活跃度", scratch: "饼铺盒玩/刮刮乐/占卜", vhs: "录像带店经营", bounty: "悬赏委托进度", weekly: "丽都周记获得积分", done: "已完成", notDone: "未完成", doing: "正在营业", claim: "待领取", refresh: "后更新", opens: "后开放", today: "今日", tomorrow: "明日", fullSuffix: "回满", lessMinute: "少于1分钟", day: "天", hour: "小时", minute: "分" },
  jp: { title: "リアルタイムノート", energy: "バッテリー", full: "バッテリー全回復", activity: "イベントカレンダー", vitality: "本日の活躍度", scratch: "ボックス玩具/スクラッチ/占い", vhs: "ビデオ屋経営", bounty: "懸賞依頼進捗", weekly: "麗都ウィークリーPt", done: "完了", notDone: "未完了", doing: "営業中", claim: "受取可能", refresh: "後に更新", opens: "後に開放", today: "今日 ", tomorrow: "明日 ", fullSuffix: " 全回復", lessMinute: "1分未満", day: "日", hour: "時間", minute: "分" },
  kr: { title: "실시간 메모", energy: "배터리", full: "배터리 완충", activity: "이벤트 캘린더", vitality: "오늘의 활약도", scratch: "뽑기/스크래치/운세", vhs: "비디오 가게 경영", bounty: "현상 의뢰 진행도", weekly: "리두 주간 포인트", done: "완료", notDone: "미완료", doing: "영업 중", claim: "수령 가능", refresh: " 후 갱신", opens: " 후 개방", today: "오늘 ", tomorrow: "내일 ", fullSuffix: " 완충", lessMinute: "1분 미만", day: "일", hour: "시간", minute: "분" },
  fr: { title: "Notes en temps réel", energy: "Batterie", full: "Batterie pleine", activity: "Calendrier des événements", vitality: "Activité quotidienne", scratch: "Jouet / Gratte-gratte / Divination", vhs: "Gestion du vidéoclub", bounty: "Progression des primes", weekly: "Points hebdomadaires de Ridu", done: "Terminé", notDone: "Non terminé", doing: "Ouvert", claim: "À récupérer", refresh: " avant actualisation", opens: " avant ouverture", today: "Aujourd'hui ", tomorrow: "Demain ", fullSuffix: " pleine", lessMinute: "<1 min", day: "j", hour: "h", minute: "min" },
  vi: { title: "Ghi chú thời gian thực", energy: "Điện lượng", full: "Điện lượng đã đầy", activity: "Lịch sự kiện", vitality: "Năng động hôm nay", scratch: "Đồ chơi / Thẻ cào / Bói", vhs: "Kinh doanh tiệm băng hình", bounty: "Tiến độ ủy thác", weekly: "Điểm tuần Ridu", done: "Đã hoàn thành", notDone: "Chưa hoàn thành", doing: "Đang kinh doanh", claim: "Có thể nhận", refresh: " đến khi làm mới", opens: " đến khi mở", today: "Hôm nay ", tomorrow: "Ngày mai ", fullSuffix: " đầy", lessMinute: "<1 phút", day: "ngày", hour: "giờ", minute: "phút" },
};

const SIGNAL: Record<string, Partial<SignalText>> = {
  tw: { recordTitle: "調頻紀錄", notSynced: "尚未同步", syncFailed: "同步失敗", updatedAt: "更新於", total: "總抽數", averageS: "平均 S 抽數", averageUp: "平均 UP 抽數", winRate: "不歪率", polychrome: "菲林", encrypted: "加密母帶", original: "原裝母帶", boopon: "邦布券", liveResources: "即時調頻資源", unavailable: "暫時無法取得", currentPity: "目前抽卡進度", estimated: "推算", periodS: "本期 S 級", noS: "尚無 S 級紀錄", sRecords: "S 級紀錄", page: "第", perPage10: "每頁 10 筆", noSForBanner: "此卡池尚無 S 級紀錄", allRecords: "全部紀錄", dateRange: "日期範圍", noRecords: "此卡池尚無紀錄", unclassified: "未分類", banner: "卡池", sourcePlaceholder: "選擇紀錄來源", official: "官方封存", manual: "手動匯入", categoryPlaceholder: "選擇頻道類型", archived: "已有封存紀錄", empty: "尚無紀錄", bannerPlaceholder: "選擇單期卡池", newer: "較新卡池", older: "較舊卡池", all: "全部紀錄", overview: "返回總覽", previous: "上一頁", next: "下一頁", importUrl: "匯入 URL", howUrl: "如何取得 URL" },
  cn: { recordTitle: "调频记录", notSynced: "尚未同步", syncFailed: "同步失败", updatedAt: "更新于", total: "总抽数", averageS: "平均 S 抽数", averageUp: "平均 UP 抽数", winRate: "不歪率", polychrome: "菲林", encrypted: "加密母带", original: "原装母带", boopon: "邦布券", liveResources: "即时调频资源", unavailable: "暂时无法取得", currentPity: "当前抽卡进度", estimated: "推算", periodS: "本期 S 级", noS: "暂无 S 级记录", sRecords: "S 级记录", page: "第", perPage10: "每页 10 条", noSForBanner: "此卡池暂无 S 级记录", allRecords: "全部记录", dateRange: "日期范围", noRecords: "此卡池暂无记录", unclassified: "未分类", banner: "卡池", sourcePlaceholder: "选择记录来源", official: "官方封存", manual: "手动导入", categoryPlaceholder: "选择频道类型", archived: "已有封存记录", empty: "暂无记录", bannerPlaceholder: "选择单期卡池", newer: "较新卡池", older: "较旧卡池", all: "全部记录", overview: "返回总览", previous: "上一页", next: "下一页", importUrl: "导入 URL", howUrl: "如何取得 URL" },
  jp: { recordTitle: "変調記録", notSynced: "未同期", syncFailed: "同期失敗", updatedAt: "更新", total: "総抽選数", averageS: "平均Sランク", averageUp: "平均UP", winRate: "すり抜け回避率", polychrome: "ポリクローム", encrypted: "暗号化マスターテープ", original: "未加工マスターテープ", boopon: "ボンプチケット", liveResources: "現在の変調資源", unavailable: "取得できません", currentPity: "現在の天井進捗", estimated: "推定", periodS: "今回のSランク", noS: "Sランク記録なし", sRecords: "Sランク記録", page: "ページ", perPage10: "10件ずつ", noSForBanner: "このチャンネルにSランク記録はありません", allRecords: "全記録", dateRange: "期間", noRecords: "記録がありません", unclassified: "未分類", banner: "チャンネル", sourcePlaceholder: "記録元を選択", official: "公式アーカイブ", manual: "手動インポート", categoryPlaceholder: "チャンネル種類を選択", archived: "保存済み", empty: "記録なし", bannerPlaceholder: "期間を選択", newer: "新しい期間", older: "古い期間", all: "全記録", overview: "概要へ", previous: "前へ", next: "次へ", importUrl: "URLをインポート", howUrl: "URLの取得方法" },
  kr: { recordTitle: "변조 기록", notSynced: "동기화 안 됨", syncFailed: "동기화 실패", updatedAt: "업데이트", total: "총 뽑기", averageS: "평균 S 뽑기", averageUp: "평균 UP 뽑기", winRate: "픽업 성공률", polychrome: "폴리크롬", encrypted: "암호화 마스터 테이프", original: "마스터 테이프", boopon: "본부 티켓", liveResources: "현재 변조 재화", unavailable: "가져올 수 없음", currentPity: "현재 천장 진행도", estimated: "추정", periodS: "이번 S급", noS: "S급 기록 없음", sRecords: "S급 기록", page: "페이지", perPage10: "페이지당 10개", noSForBanner: "이 채널에 S급 기록이 없습니다", allRecords: "전체 기록", dateRange: "날짜 범위", noRecords: "기록 없음", unclassified: "미분류", banner: "채널", sourcePlaceholder: "기록 출처 선택", official: "공식 보관", manual: "수동 가져오기", categoryPlaceholder: "채널 유형 선택", archived: "보관 기록 있음", empty: "기록 없음", bannerPlaceholder: "기간 선택", newer: "최신", older: "이전", all: "전체 기록", overview: "개요로", previous: "이전", next: "다음", importUrl: "URL 가져오기", howUrl: "URL 얻는 법" },
  fr: { recordTitle: "Historique de recherche", notSynced: "Non synchronisé", syncFailed: "Échec de synchronisation", updatedAt: "Mis à jour", total: "Tirages totaux", averageS: "Moyenne S", averageUp: "Moyenne UP", winRate: "Taux de victoire", polychrome: "Polychrome", encrypted: "Master Bande cryptée", original: "Master Bande", boopon: "Boopon", liveResources: "Ressources actuelles", unavailable: "Indisponible", currentPity: "Pitié actuelle", estimated: "Estimé", periodS: "Rang S de la bannière", noS: "Aucun rang S", sRecords: "Historique rang S", page: "Page", perPage10: "10 par page", noSForBanner: "Aucun rang S pour cette bannière", allRecords: "Tous les tirages", dateRange: "Période", noRecords: "Aucun tirage", unclassified: "Non classé", banner: "Bannière", sourcePlaceholder: "Choisir la source", official: "Archive officielle", manual: "Import manuel", categoryPlaceholder: "Choisir le canal", archived: "Archive disponible", empty: "Aucun historique", bannerPlaceholder: "Choisir la bannière", newer: "Plus récent", older: "Plus ancien", all: "Tous les tirages", overview: "Vue d'ensemble", previous: "Précédent", next: "Suivant", importUrl: "Importer URL", howUrl: "Obtenir l'URL" },
  vi: { recordTitle: "Lịch sử tìm kiếm", notSynced: "Chưa đồng bộ", syncFailed: "Đồng bộ thất bại", updatedAt: "Cập nhật", total: "Tổng lượt", averageS: "Trung bình S", averageUp: "Trung bình UP", winRate: "Tỷ lệ thắng", polychrome: "Polychrome", encrypted: "Băng Mã Hóa", original: "Băng Gốc", boopon: "Vé Bangboo", liveResources: "Tài nguyên hiện tại", unavailable: "Tạm thời không có", currentPity: "Bảo hiểm hiện tại", estimated: "Ước tính", periodS: "S-rank kỳ này", noS: "Chưa có S-rank", sRecords: "Lịch sử S-rank", page: "Trang", perPage10: "10 mục mỗi trang", noSForBanner: "Kênh này chưa có S-rank", allRecords: "Tất cả lịch sử", dateRange: "Khoảng ngày", noRecords: "Chưa có lịch sử", unclassified: "Chưa phân loại", banner: "Kênh", sourcePlaceholder: "Chọn nguồn", official: "Lưu trữ chính thức", manual: "Nhập thủ công", categoryPlaceholder: "Chọn loại kênh", archived: "Đã có lưu trữ", empty: "Chưa có", bannerPlaceholder: "Chọn kỳ", newer: "Mới hơn", older: "Cũ hơn", all: "Tất cả", overview: "Tổng quan", previous: "Trước", next: "Sau", importUrl: "Nhập URL", howUrl: "Cách lấy URL" },
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
