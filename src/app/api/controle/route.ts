import {
  controleInventoryVisitIds,
  controleScanBarcode,
  finishWilmarControle,
} from "@/lib/controle-wilmar";
import { NextResponse } from "next/server";

export async function GET() {
  const inventoryVisitIds = await controleInventoryVisitIds();
  return NextResponse.json({ inventoryVisitIds });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const action = String(body.action ?? "");

    if (action === "start") {
      const inventoryVisitIds = await controleInventoryVisitIds();
      return NextResponse.json({ ok: true, inventoryVisitIds });
    }

    if (action === "scan") {
      const result = await controleScanBarcode({
        barcode: String(body.barcode ?? ""),
        pendingVisitIds: (body.pendingVisitIds ?? []) as string[],
        alreadyScannedBarcodes: (body.alreadyScannedBarcodes ?? []) as string[],
        inventoryVisitIdsAtStart: (body.inventoryVisitIdsAtStart ?? []) as string[],
      });
      if (!result.ok) {
        return NextResponse.json({ ok: false, message: result.message }, { status: 400 });
      }
      return NextResponse.json({ ok: true, ...result });
    }

    if (action === "finish") {
      const result = await finishWilmarControle({
        pendingVisitIds: (body.pendingVisitIds ?? []) as string[],
        scannedBarcodes: (body.scannedBarcodes ?? []) as string[],
        unexpectedBarcodes: (body.unexpectedBarcodes ?? []) as string[],
      });
      return NextResponse.json({ ok: result.ok, ...result });
    }

    return NextResponse.json({ ok: false, message: "Onbekende actie" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, message: e instanceof Error ? e.message : "Fout" }, { status: 400 });
  }
}
