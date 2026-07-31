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
    label: "兌換成功",
    color: "#C9F36A",
    background: "rgba(201, 243, 106, 0.07)",
    border: "rgba(201, 243, 106, 0.38)",
  },
  already_claimed: {
    label: "已兌換",
    color: "#8FD7FF",
    background: "rgba(143, 215, 255, 0.07)",
    border: "rgba(143, 215, 255, 0.34)",
  },
  invalid: {
    label: "兌換碼無效",
    color: "#FFD86B",
    background: "rgba(255, 216, 107, 0.07)",
    border: "rgba(255, 216, 107, 0.34)",
  },
  failed: {
    label: "兌換失敗",
    color: "#FF9B9B",
    background: "rgba(255, 155, 155, 0.07)",
    border: "rgba(255, 155, 155, 0.34)",
  },
};

export function getRedeemStatusPresentation(
  status: RedeemResultStatus,
): RedeemStatusPresentation {
  return STATUS_PRESENTATION[status] ?? STATUS_PRESENTATION.failed;
}

export function normalizeRedeemRewards(
  rewards?: string[] | string,
  status: RedeemResultStatus = "failed",
): string {
  const content = Array.isArray(rewards)
    ? rewards.filter(Boolean).join("、")
    : String(rewards || "").trim();
  if (content) return content;
  if (status === "success") return "獎勵將透過遊戲內信件發送";
  if (status === "already_claimed") return "此兌換碼已使用";
  if (status === "invalid") return "此兌換碼已失效或無法使用";
  return "本次兌換未完成";
}

export function getFirstRedeemRewardIcon(source: any): string | undefined {
  const candidates = [
    source?.rewardIcons?.[0],
    source?.reward_icons?.[0],
    source?.rewards?.[0]?.icon,
    source?.rewards?.[0]?.icon_url,
    source?.rewardIcon,
    source?.reward_icon,
    source?.icon,
  ];
  return candidates.find((value) => typeof value === "string" && value.length > 0);
}

export interface RedeemCardLayout {
  width: number;
  canvasHeight: number;
  accountHeights: number[];
  accountHeaderHeight: number;
  rowHeight: number;
  rowGap: number;
  accountGap: number;
}

const WIDTH = 920;
const HEADER_HEIGHT = 82;
const FOOTER_HEIGHT = 30;
const ACCOUNT_HEADER_HEIGHT = 66;
const ROW_HEIGHT = 88;
const ROW_GAP = 10;
const ACCOUNT_PADDING_BOTTOM = 16;
const ACCOUNT_GAP = 18;

export function calculateRedeemCardLayout(
  accountCodeCounts: number[],
): RedeemCardLayout {
  const accountHeights = accountCodeCounts.map((count) => {
    const rows = Math.max(1, Math.max(0, count));
    return (
      ACCOUNT_HEADER_HEIGHT +
      rows * ROW_HEIGHT +
      Math.max(0, rows - 1) * ROW_GAP +
      ACCOUNT_PADDING_BOTTOM
    );
  });
  const accountsHeight = accountHeights.reduce((sum, height) => sum + height, 0);
  const gapsHeight = Math.max(0, accountHeights.length - 1) * ACCOUNT_GAP;

  return {
    width: WIDTH,
    canvasHeight: Math.max(
      280,
      HEADER_HEIGHT + FOOTER_HEIGHT + accountsHeight + gapsHeight,
    ),
    accountHeights,
    accountHeaderHeight: ACCOUNT_HEADER_HEIGHT,
    rowHeight: ROW_HEIGHT,
    rowGap: ROW_GAP,
    accountGap: ACCOUNT_GAP,
  };
}
