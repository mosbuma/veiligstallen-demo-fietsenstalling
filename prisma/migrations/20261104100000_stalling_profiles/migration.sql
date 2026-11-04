-- Stalling profiles: multiple citycode/location simulations in one demo DB

CREATE TABLE "StallingProfile" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "citycode" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "dataproviderUsername" TEXT NOT NULL DEFAULT '',
    "dataproviderPassword" TEXT NOT NULL DEFAULT '',
    "reportingUsername" TEXT NOT NULL DEFAULT '',
    "reportingPassword" TEXT NOT NULL DEFAULT '',
    "passRangeStart" INTEGER NOT NULL DEFAULT 1000,
    "passRangeEnd" INTEGER NOT NULL DEFAULT 1999,
    "passRangeNext" INTEGER NOT NULL DEFAULT 1000,
    "barcodeRangeStart" INTEGER NOT NULL DEFAULT 200000,
    "barcodeRangeEnd" INTEGER NOT NULL DEFAULT 299999,
    "barcodeRangeNext" INTEGER NOT NULL DEFAULT 200000,
    "defaultIdType" INTEGER NOT NULL DEFAULT 0,
    "defaultBiketypeId" INTEGER NOT NULL DEFAULT 1,
    "defaultSectionCapacity" INTEGER NOT NULL DEFAULT 20,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StallingProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StallingProfile_citycode_locationId_key" ON "StallingProfile"("citycode", "locationId");

ALTER TABLE "AppSettings" ADD COLUMN "activeStallingProfileId" TEXT;

ALTER TABLE "Visit" ADD COLUMN "stallingProfileId" TEXT;
ALTER TABLE "Bicycle" ADD COLUMN "stallingProfileId" TEXT;
ALTER TABLE "Pass" ADD COLUMN "stallingProfileId" TEXT;

-- Seed default profile from existing AppSettings
INSERT INTO "StallingProfile" (
    "id",
    "label",
    "citycode",
    "locationId",
    "dataproviderUsername",
    "dataproviderPassword",
    "reportingUsername",
    "reportingPassword",
    "passRangeStart",
    "passRangeEnd",
    "passRangeNext",
    "barcodeRangeStart",
    "barcodeRangeEnd",
    "barcodeRangeNext",
    "defaultIdType",
    "defaultBiketypeId",
    "defaultSectionCapacity",
    "updatedAt"
)
SELECT
    'default-profile',
    COALESCE(NULLIF(TRIM("locationId"), ''), 'Stalling 1'),
    COALESCE(NULLIF(TRIM("citycode"), ''), '9933'),
    COALESCE(NULLIF(TRIM("locationId"), ''), '9933_001'),
    "dataproviderUsername",
    "dataproviderPassword",
    "reportingUsername",
    "reportingPassword",
    "passRangeStart",
    "passRangeEnd",
    "passRangeNext",
    "barcodeRangeStart",
    "barcodeRangeEnd",
    "barcodeRangeNext",
    "defaultIdType",
    "defaultBiketypeId",
    "defaultSectionCapacity",
    CURRENT_TIMESTAMP
FROM "AppSettings"
WHERE "id" = 'default';

UPDATE "AppSettings" SET "activeStallingProfileId" = 'default-profile' WHERE "id" = 'default';

UPDATE "Visit" SET "stallingProfileId" = 'default-profile' WHERE "stallingProfileId" IS NULL;
UPDATE "Bicycle" SET "stallingProfileId" = 'default-profile' WHERE "stallingProfileId" IS NULL;
UPDATE "Pass" SET "stallingProfileId" = 'default-profile' WHERE "stallingProfileId" IS NULL;

ALTER TABLE "Visit" ALTER COLUMN "stallingProfileId" SET NOT NULL;
ALTER TABLE "Bicycle" ALTER COLUMN "stallingProfileId" SET NOT NULL;
ALTER TABLE "Pass" ALTER COLUMN "stallingProfileId" SET NOT NULL;

DROP INDEX IF EXISTS "Pass_passCode_key";
CREATE UNIQUE INDEX "Pass_stallingProfileId_passCode_key" ON "Pass"("stallingProfileId", "passCode");

DROP INDEX IF EXISTS "Bicycle_barcode_key";
CREATE UNIQUE INDEX "Bicycle_stallingProfileId_barcode_key" ON "Bicycle"("stallingProfileId", "barcode");

ALTER TABLE "AppSettings" DROP COLUMN "citycode",
DROP COLUMN "locationId",
DROP COLUMN "dataproviderUsername",
DROP COLUMN "dataproviderPassword",
DROP COLUMN "reportingUsername",
DROP COLUMN "reportingPassword",
DROP COLUMN "passRangeStart",
DROP COLUMN "passRangeEnd",
DROP COLUMN "passRangeNext",
DROP COLUMN "barcodeRangeStart",
DROP COLUMN "barcodeRangeEnd",
DROP COLUMN "barcodeRangeNext",
DROP COLUMN "defaultIdType",
DROP COLUMN "defaultBiketypeId",
DROP COLUMN "defaultSectionCapacity";

ALTER TABLE "Visit" ADD CONSTRAINT "Visit_stallingProfileId_fkey" FOREIGN KEY ("stallingProfileId") REFERENCES "StallingProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Bicycle" ADD CONSTRAINT "Bicycle_stallingProfileId_fkey" FOREIGN KEY ("stallingProfileId") REFERENCES "StallingProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Pass" ADD CONSTRAINT "Pass_stallingProfileId_fkey" FOREIGN KEY ("stallingProfileId") REFERENCES "StallingProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AppSettings" ADD CONSTRAINT "AppSettings_activeStallingProfileId_fkey" FOREIGN KEY ("activeStallingProfileId") REFERENCES "StallingProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
