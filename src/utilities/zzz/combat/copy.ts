const english = ["Drive Disc Score", "Total", "Auto", "Not equipped", "Cannot score", "Weights pending", "Build", "Damage simulation", "Equipment", "Target", "Rotation", "Results", "Run", "Cancel", "Save", "Export", "Import", "Compare", "Simulation model is not verified yet", "Session expired or belongs to another user", "Edit", "Current", "Hypothetical", "Mean damage", "DPS", "Damage share", "Validation pending"] as const;
const translations: Record<string, readonly string[]> = {
  en: english,
  tw: ["驅動盤評分", "總分", "自動", "未裝備", "無法評分", "權重更新中", "流派", "傷害模擬", "配裝", "目標", "循環", "結果", "執行", "取消", "儲存", "匯出", "匯入", "比較", "戰鬥模型尚未通過驗證", "操作已過期或不屬於你", "編輯", "目前", "假設", "平均傷害", "DPS", "傷害占比", "待驗證"],
  cn: ["驱动盘评分", "总分", "自动", "未装备", "无法评分", "权重更新中", "流派", "伤害模拟", "配装", "目标", "循环", "结果", "执行", "取消", "保存", "导出", "导入", "比较", "战斗模型尚未通过验证", "操作已过期或不属于你", "编辑", "当前", "假设", "平均伤害", "DPS", "伤害占比", "待验证"],
  jp: ["ディスク評価", "合計", "自動", "未装備", "評価不可", "重み更新待ち", "ビルド", "ダメージ計算", "装備", "対象", "ローテーション", "結果", "実行", "キャンセル", "保存", "エクスポート", "インポート", "比較", "戦闘モデルは未検証です", "操作の有効期限切れ、または所有者が異なります", "編集", "現在", "仮定", "平均ダメージ", "DPS", "ダメージ割合", "検証待ち"],
  kr: ["디스크 평가", "합계", "자동", "미장착", "평가 불가", "가중치 업데이트 대기", "빌드", "피해량 시뮬레이션", "장비", "대상", "사이클", "결과", "실행", "취소", "저장", "내보내기", "가져오기", "비교", "전투 모델이 아직 검증되지 않았습니다", "만료되었거나 다른 사용자의 작업입니다", "편집", "현재", "가정", "평균 피해량", "DPS", "피해량 비율", "검증 대기"],
  vi: ["Điểm đĩa", "Tổng", "Tự động", "Chưa trang bị", "Không thể chấm", "Chờ cập nhật", "Lối chơi", "Mô phỏng sát thương", "Trang bị", "Mục tiêu", "Chuỗi hành động", "Kết quả", "Chạy", "Hủy", "Lưu", "Xuất", "Nhập", "So sánh", "Mô hình chiến đấu chưa được xác minh", "Phiên đã hết hạn hoặc thuộc người khác", "Sửa", "Hiện tại", "Giả định", "Sát thương trung bình", "DPS", "Tỷ lệ sát thương", "Chờ xác minh"],
  fr: ["Score des disques", "Total", "Auto", "Non équipé", "Score indisponible", "Poids en attente", "Configuration", "Simulation de dégâts", "Équipement", "Cible", "Rotation", "Résultats", "Lancer", "Annuler", "Enregistrer", "Exporter", "Importer", "Comparer", "Modèle de combat non vérifié", "Session expirée ou appartenant à un autre utilisateur", "Modifier", "Actuel", "Hypothétique", "Dégâts moyens", "DPS", "Part des dégâts", "Validation en attente"],
};
export type CombatTextKey = "score" | "total" | "auto" | "empty" | "invalid" | "pending" | "build" | "simulation" | "equipment" | "target" | "rotation" | "results" | "run" | "cancel" | "save" | "export" | "import" | "compare" | "unverified" | "expired" | "edit" | "current" | "hypothetical" | "damage" | "dps" | "share" | "validation";
const keys: CombatTextKey[] = ["score", "total", "auto", "empty", "invalid", "pending", "build", "simulation", "equipment", "target", "rotation", "results", "run", "cancel", "save", "export", "import", "compare", "unverified", "expired", "edit", "current", "hypothetical", "damage", "dps", "share", "validation"];
export function combatText(locale: string): Record<CombatTextKey, string> {
  const code = ({"zh-tw": "tw", "zh-cn": "cn", ja: "jp", ko: "kr"} as Record<string, string>)[locale.toLowerCase()] ?? locale.split("-")[0];
  const values = translations[code] ?? english;
  return Object.fromEntries(keys.map((k, i) => [k, values[i]])) as Record<CombatTextKey, string>;
}
