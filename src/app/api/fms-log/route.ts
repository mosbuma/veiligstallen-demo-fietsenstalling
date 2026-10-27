import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  const logs = await prisma.fmsLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { visit: { select: { externalTransactionId: true } } },
  });
  return NextResponse.json({ data: logs });
}
