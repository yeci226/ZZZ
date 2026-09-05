import { normalizeZzzLocale } from "./canvasFonts.js";

export interface SignalActionText {
  onlyInvoker: string;
  privateDisabled: string;
  orphaned: string;
  manualMissing: string;
  accountMissing: string;
  syncUnavailable: string;
  archiveMissing: string;
  ownerImportOnly: string;
  importComplete: string;
  importFailedTitle: string;
  displayFailedTitle: string;
  updateFailed: string;
  modalDenied: string;
  modalTitle: string;
  modalUrlLabel: string;
  howIntro: string;
}

const TEXT: Record<string, SignalActionText> = {
  tw: {
    onlyInvoker: "只有發起指令的使用者可以操作這份調頻紀錄。",
    privateDisabled: "這名玩家已關閉抽卡資訊公開。",
    orphaned: "這份封存正在等待刪除，只有資料擁有者可以查看。",
    manualMissing: "尚未建立手動匯入封存。",
    accountMissing: "找不到可用的 ZZZ 帳號。",
    syncUnavailable: "官方紀錄同步失敗，且沒有可用的既有封存。",
    archiveMissing: "這份調頻封存已不存在，請重新執行指令。",
    ownerImportOnly: "只有資料擁有者可以匯入手動紀錄。",
    importComplete: "匯入完成：新增 {inserted} 筆，讀取 {fetched} 筆。",
    importFailedTitle: "手動匯入失敗",
    displayFailedTitle: "無法顯示調頻紀錄",
    updateFailed: "調頻紀錄更新失敗：{error}",
    modalDenied: "這份調頻封存已不存在，或你沒有匯入權限。",
    modalTitle: "匯入調頻紀錄 URL",
    modalUrlLabel: "調頻紀錄 URL",
    howIntro: "在 PC 開啟《絕區零》的調頻紀錄頁，再於 Windows PowerShell 執行：",
  },
  cn: {
    onlyInvoker: "只有发起指令的用户可以操作这份调频记录。",
    privateDisabled: "该玩家已关闭抽卡信息公开。",
    orphaned: "这份封存正在等待删除，只有数据所有者可以查看。",
    manualMissing: "尚未建立手动导入封存。",
    accountMissing: "找不到可用的 ZZZ 账号。",
    syncUnavailable: "官方记录同步失败，且没有可用的已有封存。",
    archiveMissing: "这份调频封存已不存在，请重新执行指令。",
    ownerImportOnly: "只有数据所有者可以导入手动记录。",
    importComplete: "导入完成：新增 {inserted} 条，读取 {fetched} 条。",
    importFailedTitle: "手动导入失败",
    displayFailedTitle: "无法显示调频记录",
    updateFailed: "调频记录更新失败：{error}",
    modalDenied: "这份调频封存已不存在，或你没有导入权限。",
    modalTitle: "导入调频记录 URL",
    modalUrlLabel: "调频记录 URL",
    howIntro: "在 PC 打开《绝区零》的调频记录页，然后在 Windows PowerShell 执行：",
  },
  en: {
    onlyInvoker: "Only the user who ran the command can control these Signal Search records.",
    privateDisabled: "This player has disabled public access to their Signal Search information.",
    orphaned: "This archive is pending deletion and can only be viewed by its owner.",
    manualMissing: "No manual-import archive has been created yet.",
    accountMissing: "No available ZZZ account was found.",
    syncUnavailable: "Official records could not be synced and no existing archive is available.",
    archiveMissing: "This Signal Search archive no longer exists. Run the command again.",
    ownerImportOnly: "Only the data owner can import manual records.",
    importComplete: "Import complete: {inserted} new records from {fetched} fetched records.",
    importFailedTitle: "Manual import failed",
    displayFailedTitle: "Unable to display Signal Search records",
    updateFailed: "Signal Search update failed: {error}",
    modalDenied: "This archive no longer exists, or you do not have permission to import.",
    modalTitle: "Import Signal Search URL",
    modalUrlLabel: "Signal Search URL",
    howIntro: "Open the Signal Search records page in ZZZ on PC, then run this in Windows PowerShell:",
  },
  jp: {
    onlyInvoker: "コマンドを実行したユーザーのみ、この変調記録を操作できます。",
    privateDisabled: "このプレイヤーは変調情報を非公開にしています。",
    orphaned: "このアーカイブは削除待ちのため、所有者のみ閲覧できます。",
    manualMissing: "手動インポートのアーカイブはまだありません。",
    accountMissing: "利用可能なZZZアカウントが見つかりません。",
    syncUnavailable: "公式記録の同期に失敗し、利用可能な既存アーカイブもありません。",
    archiveMissing: "この変調アーカイブは存在しません。もう一度コマンドを実行してください。",
    ownerImportOnly: "データ所有者のみ手動記録をインポートできます。",
    importComplete: "インポート完了：{fetched}件を取得し、{inserted}件を追加しました。",
    importFailedTitle: "手動インポート失敗",
    displayFailedTitle: "変調記録を表示できません",
    updateFailed: "変調記録の更新に失敗しました：{error}",
    modalDenied: "アーカイブが存在しないか、インポート権限がありません。",
    modalTitle: "変調記録URLをインポート",
    modalUrlLabel: "変調記録URL",
    howIntro: "PC版『ゼンレスゾーンゼロ』で変調記録ページを開き、Windows PowerShellで次を実行してください：",
  },
  kr: {
    onlyInvoker: "명령어를 실행한 사용자만 이 변조 기록을 조작할 수 있습니다.",
    privateDisabled: "이 플레이어는 변조 정보 공개를 비활성화했습니다.",
    orphaned: "이 보관 기록은 삭제 대기 중이며 소유자만 볼 수 있습니다.",
    manualMissing: "아직 수동 가져오기 보관 기록이 없습니다.",
    accountMissing: "사용 가능한 ZZZ 계정을 찾을 수 없습니다.",
    syncUnavailable: "공식 기록 동기화에 실패했고 기존 보관 기록도 없습니다.",
    archiveMissing: "이 변조 보관 기록이 더 이상 존재하지 않습니다. 명령어를 다시 실행해 주세요.",
    ownerImportOnly: "데이터 소유자만 수동 기록을 가져올 수 있습니다.",
    importComplete: "가져오기 완료: {fetched}개를 읽고 {inserted}개를 추가했습니다.",
    importFailedTitle: "수동 가져오기 실패",
    displayFailedTitle: "변조 기록을 표시할 수 없음",
    updateFailed: "변조 기록 업데이트 실패: {error}",
    modalDenied: "보관 기록이 없거나 가져오기 권한이 없습니다.",
    modalTitle: "변조 기록 URL 가져오기",
    modalUrlLabel: "변조 기록 URL",
    howIntro: "PC에서 ZZZ 변조 기록 페이지를 연 다음 Windows PowerShell에서 다음을 실행하세요:",
  },
  fr: {
    onlyInvoker: "Seule la personne ayant lancé la commande peut utiliser cet historique.",
    privateDisabled: "Ce joueur a désactivé l’accès public à ses recherches de signal.",
    orphaned: "Cette archive est en attente de suppression et seul son propriétaire peut la consulter.",
    manualMissing: "Aucune archive importée manuellement n’a encore été créée.",
    accountMissing: "Aucun compte ZZZ disponible n’a été trouvé.",
    syncUnavailable: "La synchronisation officielle a échoué et aucune archive existante n’est disponible.",
    archiveMissing: "Cette archive n’existe plus. Relancez la commande.",
    ownerImportOnly: "Seul le propriétaire des données peut importer des historiques manuels.",
    importComplete: "Import terminé : {inserted} nouveaux enregistrements sur {fetched} récupérés.",
    importFailedTitle: "Échec de l’import manuel",
    displayFailedTitle: "Impossible d’afficher l’historique",
    updateFailed: "Échec de la mise à jour : {error}",
    modalDenied: "Cette archive n’existe plus ou vous n’avez pas l’autorisation d’importer.",
    modalTitle: "Importer l’URL de l’historique",
    modalUrlLabel: "URL de l’historique",
    howIntro: "Ouvrez l’historique des recherches de signal de ZZZ sur PC, puis exécutez ceci dans Windows PowerShell :",
  },
  vi: {
    onlyInvoker: "Chỉ người đã chạy lệnh mới có thể thao tác lịch sử tín hiệu này.",
    privateDisabled: "Người chơi này đã tắt quyền xem công khai thông tin tín hiệu.",
    orphaned: "Bản lưu này đang chờ xóa và chỉ chủ sở hữu mới có thể xem.",
    manualMissing: "Chưa có bản lưu nhập thủ công.",
    accountMissing: "Không tìm thấy tài khoản ZZZ khả dụng.",
    syncUnavailable: "Không thể đồng bộ lịch sử chính thức và không có bản lưu hiện có.",
    archiveMissing: "Bản lưu tín hiệu này không còn tồn tại. Hãy chạy lại lệnh.",
    ownerImportOnly: "Chỉ chủ sở hữu dữ liệu mới có thể nhập lịch sử thủ công.",
    importComplete: "Nhập hoàn tất: thêm {inserted} mục từ {fetched} mục đã đọc.",
    importFailedTitle: "Nhập thủ công thất bại",
    displayFailedTitle: "Không thể hiển thị lịch sử tín hiệu",
    updateFailed: "Cập nhật lịch sử tín hiệu thất bại: {error}",
    modalDenied: "Bản lưu không còn tồn tại hoặc bạn không có quyền nhập.",
    modalTitle: "Nhập URL lịch sử tín hiệu",
    modalUrlLabel: "URL lịch sử tín hiệu",
    howIntro: "Mở trang lịch sử tín hiệu ZZZ trên PC, sau đó chạy lệnh sau trong Windows PowerShell:",
  },
};

export function signalActionText(locale?: string): SignalActionText {
  return TEXT[normalizeZzzLocale(locale)] ?? TEXT.en!;
}

export function formatSignalAction(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => String(values[key] ?? `{${key}}`));
}
