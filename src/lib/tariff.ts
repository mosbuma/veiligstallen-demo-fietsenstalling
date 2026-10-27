import type { TariffStep } from "@/lib/settings";

export function calculateTransactionCost(durationMinutes: number, rates: TariffStep[]): number {
  if (rates.length === 0 || durationMinutes <= 0) return 0;
  const unit = rates[0]?.unit ?? "hours";
  const durationInUnit = unit === "hours" ? durationMinutes / 60 : durationMinutes;
  let totalCost = 0;
  let elapsed = 0;
  for (const rule of rates) {
    if (elapsed >= durationInUnit) break;
    const periods = Math.floor((durationInUnit - elapsed) / rule.timespan);
    totalCost += periods * rule.cost;
    elapsed += periods * rule.timespan;
  }
  return Math.round(totalCost * 100) / 100;
}

export function stallingsduurMinutes(checkIn: Date, checkOut: Date): number {
  return Math.max(0, Math.round((checkOut.getTime() - checkIn.getTime()) / 60000));
}
