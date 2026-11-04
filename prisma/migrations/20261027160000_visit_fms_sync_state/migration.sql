-- Per-visit FMS sync outcome (debugging)
ALTER TABLE "Visit" ADD COLUMN "fmsSyncStatus" TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "Visit" ADD COLUMN "fmsSyncAt" TIMESTAMP(3);
ALTER TABLE "Visit" ADD COLUMN "fmsSyncMessage" TEXT;
