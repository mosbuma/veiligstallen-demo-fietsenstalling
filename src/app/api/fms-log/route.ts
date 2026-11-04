import { clearAllFmsLogs, listFmsLogEntries } from "@/lib/fms-log-query";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const visitId = new URL(req.url).searchParams.get("visitId") ?? undefined;
  const limitParam = new URL(req.url).searchParams.get("limit");
  const limit = limitParam ? Number(limitParam) : undefined;
  const data = await listFmsLogEntries({ visitId, limit });
  return NextResponse.json({ data });
}

export async function DELETE() {
  const deleted = await clearAllFmsLogs();
  return NextResponse.json({ ok: true, deleted });
}
