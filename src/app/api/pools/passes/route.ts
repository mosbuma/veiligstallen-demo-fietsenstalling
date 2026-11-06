import { prisma } from "@/lib/db";
import { isSyntheticPassCode } from "@/lib/pass-display";
import { passCodeInPoolRange } from "@/lib/pass-checkin";
import { canonicalPoolPassCode } from "@/lib/pass-display";
import { getProtectedReads } from "@/lib/fms/metadata-cache";
import { getSettings } from "@/lib/settings";
import { passHasActiveSubscription } from "@/lib/subscription-active";
import { activeStallingScope } from "@/lib/stalling-scope";
import { NextResponse } from "next/server";

export async function GET() {
  const settings = await getSettings();
  const scope = await activeStallingScope();
  const [passRows, openVisits, cached] = await Promise.all([
    prisma.pass.findMany({
      where: scope,
      select: { passCode: true, idType: true },
      orderBy: { passCode: "asc" },
    }),
    prisma.visit.findMany({
      where: { ...scope, status: "open" },
      select: { idcode: true },
    }),
    getProtectedReads(false),
  ]);

  const subscriptions = cached?.subscriptions;
  const inUse = new Set<string>();
  for (const v of openVisits) {
    const id = v.idcode.trim();
    if (!id) continue;
    inUse.add(id);
    const canon = canonicalPoolPassCode(id);
    if (canon !== id) inUse.add(canon);
  }

  const passes = passRows
    .filter((p) => p.passCode.trim().length > 0 && !isSyntheticPassCode(p.passCode))
    .filter((p) =>
      passCodeInPoolRange(p.passCode, settings.passRangeStart, settings.passRangeEnd)
    )
    .map((p) => ({
      passCode: p.passCode,
      idType: p.idType,
      hasAbo: passHasActiveSubscription(p.passCode, subscriptions),
      openVisit: inUse.has(p.passCode),
    }));

  return NextResponse.json({
    passes,
    subscriptionsCached: Array.isArray(subscriptions) && subscriptions.length > 0,
  });
}
