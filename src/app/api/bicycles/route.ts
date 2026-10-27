import { listBuitenBicycles, listStallingFloorOnlyBicycles } from "@/lib/bicycles";
import { issueBarcodedBicycle, PoolExhaustedError } from "@/lib/ids";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const parked = url.searchParams.get("parked");
  const inside = url.searchParams.get("inside");
  if (parked === "1") {
    return NextResponse.json({ message: "Gebruik /api/visits?status=open" }, { status: 400 });
  }
  if (inside === "floor") {
    const data = await listStallingFloorOnlyBicycles();
    return NextResponse.json({ data });
  }
  const data = await listBuitenBicycles();
  return NextResponse.json({ data });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const biketypeId = Number(body.biketypeId);
    const created = await issueBarcodedBicycle(biketypeId);
    return NextResponse.json({ ok: true, ...created });
  } catch (e) {
    if (e instanceof PoolExhaustedError) {
      return NextResponse.json({ ok: false, message: e.message }, { status: 409 });
    }
    throw e;
  }
}
