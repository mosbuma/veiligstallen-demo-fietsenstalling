import { prisma } from "@/lib/db";
import { fmsLogToEntry, type FmsLogEntry } from "@/lib/fms-log-view";
import { getSettings } from "@/lib/settings";

export async function listFmsLogEntries(options: {
  visitId?: string;
  limit?: number;
}): Promise<FmsLogEntry[]> {
  const settings = await getSettings();
  const limit = options.limit ?? (options.visitId ? 200 : 500);
  const logs = await prisma.fmsLog.findMany({
    where: options.visitId ? { visitId: options.visitId } : undefined,
    orderBy: { createdAt: options.visitId ? "asc" : "desc" },
    take: limit,
    include: { visit: { select: { externalTransactionId: true } } },
  });
  return logs.map((log) => fmsLogToEntry(log, settings.fmsBaseUrl));
}

export async function clearAllFmsLogs(): Promise<number> {
  const result = await prisma.fmsLog.deleteMany({});
  return result.count;
}
