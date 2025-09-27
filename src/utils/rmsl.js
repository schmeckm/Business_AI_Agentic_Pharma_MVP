// utils/rmsl.js
import { computeRemainingShelfLife, daysBetween } from "./shelfLife.js";

export function computeRemainingPctFromDates({ manufactureDate, expiryDate }) {
  if (!manufactureDate || !expiryDate) return null;
  const total = daysBetween(manufactureDate, expiryDate);
  const remaining = daysBetween(new Date().toISOString().slice(0,10), expiryDate);
  if (total === null || remaining === null || total <= 0) return null;
  const pct = Math.max(0, Math.min(100, (remaining / total) * 100));
  return Math.round(pct * 10) / 10;
}

export function evaluateRmsl({ rmslRule, invEntry = {}, md = {} }) {
  let remainingPct = null;
  let source = "none";

  if (typeof invEntry.rmslPct === "number") {
    remainingPct = Number(invEntry.rmslPct);
    source = "inventory.rmslPct";
  }

  if (remainingPct == null && invEntry.manufactureDate && invEntry.expiryDate) {
    const p = computeRemainingPctFromDates({ manufactureDate: invEntry.manufactureDate, expiryDate: invEntry.expiryDate });
    if (p != null) { remainingPct = p; source = "inventory.dates"; }
  }

  if (remainingPct == null && md) {
    if (md.manufactureDate && md.expiryDate) {
      const p = computeRemainingPctFromDates({ manufactureDate: md.manufactureDate, expiryDate: md.expiryDate });
      if (p != null) { remainingPct = p; source = "masterdata.dates"; }
    } else if (md.shelfLifeDays && md.manufactureDate) {
      const total = md.shelfLifeDays;
      const now = new Date().toISOString().slice(0,10);
      const elapsed = daysBetween(md.manufactureDate, now);
      const rem = Math.max(0, total - (elapsed || 0));
      remainingPct = Math.round((rem / total) * 100 * 10) / 10;
      source = "masterdata.shelfLifeDays";
    }
  }

  const minPct = (rmslRule && typeof rmslRule.minPct === "number") ? rmslRule.minPct : null;
  const rmslOk = minPct == null ? true : (remainingPct != null ? remainingPct >= minPct : false);
  return { rmslOk, remainingPct, source, minPct };
}
