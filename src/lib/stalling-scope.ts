import { prisma } from "@/lib/db";
import { getActiveStallingProfileId } from "@/lib/stalling-profile";

/** Prisma filter: only rows for the active stalling simulation. */
export async function activeStallingScope(): Promise<{ stallingProfileId: string }> {
  return { stallingProfileId: await getActiveStallingProfileId() };
}

export async function findPassByCode(passCode: string) {
  const { stallingProfileId } = await activeStallingScope();
  return prisma.pass.findUnique({
    where: { stallingProfileId_passCode: { stallingProfileId, passCode } },
  });
}

export async function findBicycleByBarcode(barcode: string) {
  const { stallingProfileId } = await activeStallingScope();
  return prisma.bicycle.findUnique({
    where: { stallingProfileId_barcode: { stallingProfileId, barcode } },
  });
}
