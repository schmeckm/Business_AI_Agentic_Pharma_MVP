// utils/shelfLife.js
export function daysBetween(dateA_iso, dateB_iso) {
  const a = Date.parse(dateA_iso);
  const b = Date.parse(dateB_iso);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  const ms = b - a;
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

export function computeRemainingShelfLife({ manufactureDate, expiryDate, shelfLifeDays }) {
  const now = new Date().toISOString().slice(0,10);
  if (expiryDate) {
    const remaining = daysBetween(now, expiryDate);
    let total = null;
    if (manufactureDate) total = daysBetween(manufactureDate, expiryDate);
    else if (typeof shelfLifeDays === "number") total = shelfLifeDays;
    const pct = total ? Math.max(0, Math.min(100, Math.round((remaining/total)*100))) : null;
    return { remainingDays: remaining, totalDays: total, remainingPct: pct, reason: "expiryDate" };
  }
  if (shelfLifeDays && manufactureDate) {
    const elapsed = daysBetween(manufactureDate, now);
    const remaining = Math.max(-9999, shelfLifeDays - (elapsed || 0));
    const pct = Math.round(Math.max(0, Math.min(100, (remaining/shelfLifeDays)*100)));
    return { remainingDays: remaining, totalDays: shelfLifeDays, remainingPct: pct, reason: "shelfLifeDays+manufactureDate" };
  }
  if (shelfLifeDays) return { remainingDays: null, totalDays: shelfLifeDays, remainingPct: null, reason: "onlyShelfLifeDays" };
  return { remainingDays: null, totalDays: null, remainingPct: null, reason: "unknown" };
}
