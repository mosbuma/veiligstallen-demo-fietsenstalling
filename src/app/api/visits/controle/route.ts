import { controleCheckInUnexpected, controleCheckoutMissing, syncOccupationInventory } from "@/lib/visits";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (body.action === "sync") {
      const res = await syncOccupationInventory(String(body.sectionId), body.bikes ?? []);
      return NextResponse.json({ ok: res.ok, status: res.status });
    }
    if (body.action === "checkout_missing") {
      const result = await controleCheckoutMissing(String(body.visitId));
      return NextResponse.json({ ok: true, ...result });
    }
    const result = await controleCheckInUnexpected(body);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, message: e instanceof Error ? e.message : "Fout" }, { status: 400 });
  }
}
