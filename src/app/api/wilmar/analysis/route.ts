import {
  DEMO_MT_FIELDS_MISSING,
  DEMO_MT_FIELDS_SENT,
  WILMAR_FLOW_CATALOG,
} from "@/lib/wilmar/cf-flow-catalog";
import { summarizeLocalVisits, summarizeReportingTransactions } from "@/lib/wilmar/reporting-analysis";
import { getSettings } from "@/lib/settings";
import { NextResponse } from "next/server";

function parseRange(url: string): { from: Date; to: Date } | { error: string } {
  const params = new URL(url).searchParams;
  const fromRaw = params.get("from");
  const toRaw = params.get("to");
  const to = toRaw ? new Date(toRaw) : new Date();
  const from = fromRaw ? new Date(fromRaw) : new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return { error: "Ongeldige from/to datum" };
  }
  return { from, to };
}

export async function GET(req: Request) {
  try {
    const range = parseRange(req.url);
    if ("error" in range) {
      return NextResponse.json({ ok: false, message: range.error }, { status: 400 });
    }
    const settings = await getSettings();
    const [reporting, local] = await Promise.all([
      summarizeReportingTransactions(range.from, range.to),
      summarizeLocalVisits(range.from, range.to),
    ]);

    const missingFlows = WILMAR_FLOW_CATALOG.filter((f) => f.status === "missing" || f.status === "partial");

    return NextResponse.json({
      ok: true,
      period: { from: range.from.toISOString(), to: range.to.toISOString() },
      stalling: {
        citycode: settings.citycode,
        locationId: settings.locationId,
        profileId: settings.stallingProfileId,
      },
      reporting,
      local,
      catalog: WILMAR_FLOW_CATALOG,
      missingOrPartialCount: missingFlows.length,
      managedTransactionFields: {
        demoSends: DEMO_MT_FIELDS_SENT,
        demoOmits: DEMO_MT_FIELDS_MISSING,
      },
      hints: [
        "Rapportage leest transacties_archief — kolom externaltransactionid vereist (reference/veiligstallen-acc-docker.md).",
        "Na managed POSTs: GET /api/cron/process-queues op VeiligStallen.",
        "Niet-user checkintypes (sync, system, controle) in rapportage duiden op Wilmar-flows die de demo nog niet nabootst.",
        "Referentie VS: write-sequence-scenarios.ts (Utrecht Vredenburg / testgemeente patronen).",
      ],
    });
  } catch (e) {
    console.error("[wilmar/analysis]", e);
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "Analyse mislukt" },
      { status: 500 }
    );
  }
}
