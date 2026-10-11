export const EARLY_OVER_MARKETS = ["ft_over", "ht_over", "ft_corner_over", "ht_corner_over"];
export const EARLY_OVER_SOURCE = "LIVE_OVER_EARLY_V1";
export function isEarlyOverSignal(s) {
  return EARLY_OVER_MARKETS.includes(s?.market) && String(s?.selection || "").toUpperCase() === "OVER";
}
export function isEarlyProvisional(s) {
  return s?.status === "SETTLED" && s?.settlementSource === EARLY_OVER_SOURCE;
}
