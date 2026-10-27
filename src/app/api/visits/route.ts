import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const status = new URL(req.url).searchParams.get("status");
  const visits = await prisma.visit.findMany({
    where: status ? { status } : undefined,
    include: { bicycle: true, pass: true },
    orderBy: { checkInDate: "desc" },
    take: 200,
  });
  return NextResponse.json({
    data: visits.map((v) => ({
      ...v,
      stallingskosten: v.stallingskosten != null ? Number(v.stallingskosten) : null,
    })),
  });
}
