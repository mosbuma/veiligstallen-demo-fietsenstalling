import { getFmsBatchStatus, runVeiligstallenBatchSync } from "@/lib/fms-batch-sync";
import { NextResponse } from "next/server";

export async function GET() {
  const status = await getFmsBatchStatus();
  return NextResponse.json(status);
}

export async function POST() {
  try {
    const result = await runVeiligstallenBatchSync();
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "FMS batch mislukt" },
      { status: 500 }
    );
  }
}
