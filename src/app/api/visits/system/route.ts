import { placeOnFloorWithoutScan, removeFromFloorWithoutScan } from "@/lib/real-world";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (body.action === "remove") {
      const result = await removeFromFloorWithoutScan({
        visitId: body.visitId ? String(body.visitId) : undefined,
        barcode: body.barcode ? String(body.barcode) : undefined,
      });
      return NextResponse.json({ ok: true, ...result });
    }
    const result = await placeOnFloorWithoutScan({
      barcode: String(body.barcode),
      biketypeId: Number(body.biketypeId),
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, message: e instanceof Error ? e.message : "Fout" }, { status: 400 });
  }
}
