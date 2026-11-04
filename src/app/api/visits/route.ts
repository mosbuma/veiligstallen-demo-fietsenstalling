import { prisma } from "@/lib/db";
import { activeStallingScope } from "@/lib/stalling-scope";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const status = new URL(req.url).searchParams.get("status");
  const scope = await activeStallingScope();
  const visits = await prisma.visit.findMany({
    where: { ...scope, ...(status ? { status } : {}) },
    include: { bicycle: true, pass: true },
    orderBy: { checkInDate: "desc" },
    take: 200,
  });
  return NextResponse.json({
    data: visits.map((v) => ({
      ...v,
      inventoryBarcode: v.inventoryBarcode,
      stallingskosten: v.stallingskosten != null ? Number(v.stallingskosten) : null,
    })),
  });
}
