import { locales, uiLocale } from "../settings/presentation.js";
const copy = {
  title: ["Signal simulation settings", "模擬調頻設定", "模拟调频设置", "変調シミュレーション設定", "변조 시뮬레이션 설정", "Réglages de simulation", "Cài đặt mô phỏng tín hiệu"],
  banner: ["Banner", "卡池", "卡池", "ガチャ", "채널", "Bannière", "Banner"],
  candidates: ["Non-UP S candidates", "S 級非 UP 候選", "S 级非 UP 候选", "非 UP S 級候補", "비 UP S급 후보", "Candidats S hors UP", "Ứng viên S không UP"],
  aUp: ["A-rank UP", "A 級 UP", "A 级 UP", "A 級 UP", "A급 UP", "Rang A UP", "Hạng A UP"],
  animation: ["Animation", "動畫", "动画", "アニメーション", "애니메이션", "Animation", "Hoạt ảnh"],
  advanced: ["Advanced probabilities", "進階機率設定", "高级概率设置", "確率の詳細設定", "고급 확률 설정", "Probabilités avancées", "Xác suất nâng cao"],
  base: ["Base probability", "基礎機率", "基础概率", "基礎確率", "기본 확률", "Probabilité de base", "Xác suất cơ bản"],
  pity: ["Guarantee", "保底", "保底", "天井", "천장", "Garantie", "Bảo hiểm"],
  reset: ["Game defaults", "遊戲預設", "游戏默认", "ゲームの既定値", "게임 기본값", "Valeurs du jeu", "Mặc định trò chơi"],
  versions: ["Saved rules", "歷史設定", "历史设置", "保存済み設定", "저장된 설정", "Réglages enregistrés", "Quy tắc đã lưu"],
  search: ["Search banners", "搜尋卡池", "搜索卡池", "ガチャ検索", "채널 검색", "Chercher une bannière", "Tìm banner"],
  applied: ["Saved settings apply to new commands. Existing draws keep their rules.", "儲存後套用於新指令；舊訊息續抽沿用原設定。", "保存后用于新指令；旧消息继续使用原设置。", "保存後の新規コマンドに適用。既存の結果は元の設定を維持します。", "새 명령에 적용됩니다. 기존 뽑기는 이전 설정을 유지합니다.", "Appliqué aux nouvelles commandes. Les tirages existants gardent leurs règles.", "Áp dụng cho lệnh mới. Lượt quay cũ giữ nguyên quy tắc."],
  selected: ["Selected", "已選", "已选", "選択済み", "선택됨", "Sélectionné", "Đã chọn"],
  custom: ["Custom", "自訂", "自定义", "カスタム", "사용자 지정", "Personnalisé", "Tùy chỉnh"],
} satisfies Record<string, string[]>;
export const gachaSettingText = (locale: unknown, key: keyof typeof copy) => copy[key][locales.indexOf(uiLocale(locale))];
