/** Preserve API error codes for the shared authentication classifier. */
export function classifyDailyClaim(claim: {
  code?: unknown;
  status?: unknown;
}): "success" | "already_signed" {
  const code =
    claim.code === null || claim.code === undefined || claim.code === ""
      ? NaN
      : Number(claim.code);
  if (code === 0) return "success";
  if (code === -5003) return "already_signed";
  throw Object.assign(
    new Error(
      `${String(claim.status || "Daily claim failed")} (Code: ${String(claim.code ?? "missing")})`,
    ),
    { code },
  );
}
