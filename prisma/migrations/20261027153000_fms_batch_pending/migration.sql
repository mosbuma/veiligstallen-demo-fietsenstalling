ALTER TABLE "Visit" ADD COLUMN "fmsPending" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Visit" ADD COLUMN "fmsSyncedAt" TIMESTAMP(3);

ALTER TABLE "Bicycle" ADD COLUMN "floorFmsPending" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "AppSettings" ADD COLUMN "lastFmsBatchAt" TIMESTAMP(3);
ALTER TABLE "AppSettings" ADD COLUMN "lastFmsBatchOk" BOOLEAN;
ALTER TABLE "AppSettings" ADD COLUMN "lastFmsBatchMessage" TEXT NOT NULL DEFAULT '';

UPDATE "Visit" SET "fmsPending" = false WHERE "fmsSyncedAt" IS NOT NULL;
UPDATE "Visit" SET "fmsPending" = true WHERE "status" = 'open';
