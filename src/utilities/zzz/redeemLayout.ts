export type RedeemResultStatus =
  | "success"
  | "already_claimed"
  | "invalid"
  | "failed";

export interface RedeemStatusPresentation {
  label: string;
  color: string;
  background: string;
  border: string;
}

const STATUS_PRESENTATION: Record<RedeemResultStatus, RedeemStatusPresentation> = {
  success: {
    label: "成功",
    color: "#B8F25A",
    background: "rgba(98, 141, 31, 0.28)",
    border: "rgba(184, 242, 90, 0.58)",
  },
  already_claimed: {
    label: "已兌換",
    color: "#8FD7FF",
    background: "rgba(35, 104, 143, 0.28)",
    border: "rgba(143, 215, 255, 0.56)",
  },
  invalid: {
    label: "無效",
    color: "#FFD86B",
    background: "rgba(145, 101, 35, 0.30)",
    border: "rgba(255, 216, 107, 0.56)",
  },
  failed: {
    label: "失敗",
    color: "#FF9B9B",
    background: "rgba(148, 58, 58, 0.30)",
    border: "rgba(255, 155, 155, 0.56)",
  },
};

export function getRedeemStatusPresentation(
  status: RedeemResultStatus,
): RedeemStatusPresentation {
  return STATUS_PRESENTATION[status] ?? STATUS_PRESENTATION.failed;
}

export interface RedeemCardLayout {
  width: number;
  canvasHeight: number;
  tilesPerRow: number;
  accountHeights: number[];
  accountHeaderHeight: number;
  tileHeight: number;
  tileGap: number;
  accountGap: number;
}

const WIDTH = 1280;
const TOP_AND_FOOTER = 156;
const TILES_PER_ROW = 2;
const ACCOUNT_HEADER_HEIGHT = 70;
const TILE_HEIGHT = 150;
const TILE_GAP = 16;
const ACCOUNT_PADDING_BOTTOM = 24;
const ACCOUNT_GAP = 20;

export function calculateRedeemCardLayout(
  accountCodeCounts: number[],
): RedeemCardLayout {
  const accountHeights = accountCodeCounts.map((count) => {
    const rows = Math.max(1, Math.ceil(Math.max(0, count) / TILES_PER_ROW));
    return (
      ACCOUNT_HEADER_HEIGHT +
      rows * TILE_HEIGHT +
      Math.max(0, rows - 1) * TILE_GAP +
      ACCOUNT_PADDING_BOTTOM
    );
  });
  const accountsHeight = accountHeights.reduce((sum, height) => sum + height, 0);
  const gapsHeight = Math.max(0, accountHeights.length - 1) * ACCOUNT_GAP;

  return {
    width: WIDTH,
    canvasHeight: Math.max(520, TOP_AND_FOOTER + accountsHeight + gapsHeight),
    tilesPerRow: TILES_PER_ROW,
    accountHeights,
    accountHeaderHeight: ACCOUNT_HEADER_HEIGHT,
    tileHeight: TILE_HEIGHT,
    tileGap: TILE_GAP,
    accountGap: ACCOUNT_GAP,
  };
}
