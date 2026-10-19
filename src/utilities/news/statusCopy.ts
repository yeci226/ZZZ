import type { NewsEvent, NewsGame, NewsLocale } from "./types.js";
type StatusText = {
  games: Record<NewsGame, string>;
  update: string;
  preload: string;
  maintenance_start: string;
  maintenance_end: string;
};
export const STATUS_COPY: Record<NewsLocale, StatusText> = {
  tw: {
    games: { hsr: "崩壞：星穹鐵道", zzz: "絕區零" },
    update: "更新檔可以下載囉！如果還在維護，就再等一下吧。",
    preload: "新版本可以先下載囉，提前準備好，更新時就不用等那麼久！",
    maintenance_start: "遊戲正在維護，先休息一下，晚點再回來看看吧！",
    maintenance_end: "維護結束囉，可以回遊戲看看了！",
  },
  cn: {
    games: { hsr: "崩坏：星穹铁道", zzz: "绝区零" },
    update: "更新文件可以下载啦！如果还在维护，就再等一下吧。",
    preload: "新版本可以提前下载啦，准备好后，更新时就不用等那么久！",
    maintenance_start: "游戏正在维护，先休息一下，晚点再回来看看吧！",
    maintenance_end: "维护结束啦，可以回游戏看看了！",
  },
  en: {
    games: { hsr: "Honkai: Star Rail", zzz: "Zenless Zone Zero" },
    update:
      "The update is ready to download! If maintenance is still ongoing, hang tight.",
    preload:
      "Get the new files early so you have less to download on update day!",
    maintenance_start:
      "The game is taking a maintenance break. Grab a snack and check back later!",
    maintenance_end: "Maintenance is over! Time to hop back into the game.",
  },
  jp: {
    games: { hsr: "崩壊：スターレイル", zzz: "ゼンレスゾーンゼロ" },
    update:
      "更新データをダウンロードできます！メンテナンス中なら、もう少し待ちましょう。",
    preload:
      "新バージョンのデータを先にダウンロードして、当日の待ち時間を減らしましょう！",
    maintenance_start:
      "ただいまメンテナンス中です。ひと休みして、また後でチェックしましょう！",
    maintenance_end: "メンテナンスが終わりました！ゲームに戻ってみましょう。",
  },
  kr: {
    games: { hsr: "붕괴: 스타레일", zzz: "젠레스 존 제로" },
    update:
      "업데이트 파일을 받을 수 있어요! 아직 점검 중이라면 조금만 더 기다려 주세요.",
    preload: "새 버전 파일을 미리 받아 두면 업데이트 당일에 덜 기다려도 돼요!",
    maintenance_start:
      "지금은 점검 중이에요. 잠깐 쉬었다가 다시 확인해 주세요!",
    maintenance_end: "점검이 끝났어요! 게임으로 돌아가 볼까요?",
  },
  fr: {
    games: { hsr: "Honkai: Star Rail", zzz: "Zenless Zone Zero" },
    update:
      "La mise à jour est prête à télécharger ! Si la maintenance continue, encore un peu de patience.",
    preload:
      "Prenez de l’avance : téléchargez les fichiers pour moins attendre le jour de la mise à jour !",
    maintenance_start:
      "Le jeu est en maintenance. Faites une petite pause et revenez plus tard !",
    maintenance_end:
      "La maintenance est terminée ! Vous pouvez retourner en jeu.",
  },
  vi: {
    games: { hsr: "Honkai: Star Rail", zzz: "Zenless Zone Zero" },
    update:
      "Tải bản cập nhật được rồi! Nếu game vẫn đang bảo trì thì chờ thêm chút nhé.",
    preload:
      "Tải trước dữ liệu phiên bản mới để đỡ phải chờ vào ngày cập nhật nhé!",
    maintenance_start:
      "Game đang bảo trì. Nghỉ một chút rồi quay lại kiểm tra nhé!",
    maintenance_end: "Bảo trì xong rồi! Quay lại game thôi.",
  },
};

const STATUS_HEADINGS: Record<
  NewsLocale,
  Record<Exclude<NewsEvent["kind"], "article">, string>
> = {
  tw: {
    update: "{game}更新可下載",
    preload: "{game}預先下載已開放",
    maintenance_start: "{game}維護已開始",
    maintenance_end: "{game}維護已結束",
  },
  cn: {
    update: "{game}更新可下载",
    preload: "{game}预下载已开放",
    maintenance_start: "{game}维护已开始",
    maintenance_end: "{game}维护已结束",
  },
  en: {
    update: "{game} update ready to download",
    preload: "{game} pre-download available",
    maintenance_start: "{game} maintenance started",
    maintenance_end: "{game} maintenance ended",
  },
  jp: {
    update: "{game}：更新データ配信開始",
    preload: "{game}：事前ダウンロード開始",
    maintenance_start: "{game}：メンテナンス開始",
    maintenance_end: "{game}：メンテナンス終了",
  },
  kr: {
    update: "{game} 업데이트 다운로드 가능",
    preload: "{game} 사전 다운로드 시작",
    maintenance_start: "{game} 점검 시작",
    maintenance_end: "{game} 점검 종료",
  },
  fr: {
    update: "{game} : mise à jour disponible",
    preload: "{game} : pré-téléchargement disponible",
    maintenance_start: "{game} : début de la maintenance",
    maintenance_end: "{game} : maintenance terminée",
  },
  vi: {
    update: "{game}: Đã có thể tải bản cập nhật",
    preload: "{game}: Đã mở tải trước",
    maintenance_start: "{game}: Bắt đầu bảo trì",
    maintenance_end: "{game}: Bảo trì kết thúc",
  },
};
export function statusHeading(
  game: NewsGame,
  kind: Exclude<NewsEvent["kind"], "article">,
  locale: NewsLocale,
): string {
  return STATUS_HEADINGS[locale][kind].replace(
    "{game}",
    STATUS_COPY[locale].games[game],
  );
}
