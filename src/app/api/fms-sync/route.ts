import {
  getFmsBatchStatus,
  getVisitFmsDetail,
  getVisitFmsDetailByExternalTransactionId,
  resendVisitToFms,
  runVeiligstallenBatchSync,
  runVeiligstallenSingleSync,
} from "@/lib/fms-batch-sync";
import {
  runEmptyInventoryOccupationSync,
  runInventoryOccupationSyncFromFloor,
  runSyncOnlyOccupationSyncFromFloor,
} from "@/lib/fms/occupation-inventory-sync";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const visitId = params.get("visitId");
  const externalTransactionId = params.get("externalTransactionId");
  if (visitId || externalTransactionId) {
    const detail = visitId
      ? await getVisitFmsDetail(visitId)
      : await getVisitFmsDetailByExternalTransactionId(String(externalTransactionId));
    if (!detail) {
      return NextResponse.json({ message: "Bezoek niet gevonden" }, { status: 404 });
    }
    return NextResponse.json(detail);
  }
  const status = await getFmsBatchStatus();
  return NextResponse.json(status);
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    if (body.action === "resend" && body.visitId) {
      const result = await resendVisitToFms(String(body.visitId));
      return NextResponse.json(result, { status: result.ok ? 200 : 400 });
    }
    if (body.action === "inventory-sync") {
      const result = await runInventoryOccupationSyncFromFloor();
      return NextResponse.json(result, { status: result.ok ? 200 : 400 });
    }
    if (body.action === "inventory-sync-synconly") {
      const result = await runSyncOnlyOccupationSyncFromFloor();
      return NextResponse.json(result, { status: result.ok ? 200 : 400 });
    }
    if (body.action === "inventory-empty") {
      const result = await runEmptyInventoryOccupationSync();
      return NextResponse.json(result, { status: result.ok ? 200 : 400 });
    }
    const result =
      body.mode === "single"
        ? await runVeiligstallenSingleSync()
        : await runVeiligstallenBatchSync();
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "FMS batch mislukt" },
      { status: 500 }
    );
  }
}
