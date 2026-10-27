-- CreateTable
CREATE TABLE "AppSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "fmsBaseUrl" TEXT NOT NULL DEFAULT 'http://localhost:3000',
    "citycode" TEXT NOT NULL DEFAULT '',
    "locationId" TEXT NOT NULL DEFAULT '',
    "dataproviderUsername" TEXT NOT NULL DEFAULT '',
    "dataproviderPassword" TEXT NOT NULL DEFAULT '',
    "reportingUsername" TEXT NOT NULL DEFAULT '',
    "reportingPassword" TEXT NOT NULL DEFAULT '',
    "occupationMode" TEXT NOT NULL DEFAULT 'both',
    "clockOffsetSeconds" INTEGER NOT NULL DEFAULT 0,
    "passRangeStart" INTEGER NOT NULL DEFAULT 1000,
    "passRangeNext" INTEGER NOT NULL DEFAULT 1000,
    "barcodeRangeStart" INTEGER NOT NULL DEFAULT 200000,
    "barcodeRangeNext" INTEGER NOT NULL DEFAULT 200000,
    "defaultIdType" INTEGER NOT NULL DEFAULT 0,
    "defaultBiketypeId" INTEGER NOT NULL DEFAULT 1,
    "tariffStepsJson" TEXT NOT NULL DEFAULT '[{"timespan":1,"cost":0.5,"unit":"hours"}]',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetadataCache" (
    "id" TEXT NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetadataCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pass" (
    "id" TEXT NOT NULL,
    "accountId" TEXT,
    "passCode" TEXT NOT NULL,
    "idType" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bicycle" (
    "id" TEXT NOT NULL,
    "barcode" TEXT NOT NULL,
    "biketypeId" INTEGER NOT NULL DEFAULT 1,
    "passId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bicycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Visit" (
    "id" TEXT NOT NULL,
    "externalTransactionId" TEXT NOT NULL,
    "passId" TEXT,
    "bicycleId" TEXT,
    "sectionId" TEXT NOT NULL,
    "idcode" TEXT NOT NULL,
    "idType" INTEGER NOT NULL DEFAULT 0,
    "biketypeId" INTEGER NOT NULL DEFAULT 1,
    "checkInDate" TIMESTAMP(3) NOT NULL,
    "checkInType" TEXT NOT NULL DEFAULT 'user',
    "checkOutDate" TIMESTAMP(3),
    "checkOutType" TEXT,
    "stallingsduur" INTEGER,
    "stallingskosten" DECIMAL(8,2),
    "paymentMethod" TEXT,
    "subscriptionWaived" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Visit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FmsLog" (
    "id" TEXT NOT NULL,
    "visitId" TEXT,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "requestBody" JSONB NOT NULL,
    "statusCode" INTEGER,
    "responseBody" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FmsLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MetadataCache_cacheKey_key" ON "MetadataCache"("cacheKey");

-- CreateIndex
CREATE UNIQUE INDEX "Pass_passCode_key" ON "Pass"("passCode");

-- CreateIndex
CREATE UNIQUE INDEX "Bicycle_barcode_key" ON "Bicycle"("barcode");

-- CreateIndex
CREATE UNIQUE INDEX "Visit_externalTransactionId_key" ON "Visit"("externalTransactionId");

-- AddForeignKey
ALTER TABLE "Pass" ADD CONSTRAINT "Pass_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bicycle" ADD CONSTRAINT "Bicycle_passId_fkey" FOREIGN KEY ("passId") REFERENCES "Pass"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_passId_fkey" FOREIGN KEY ("passId") REFERENCES "Pass"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_bicycleId_fkey" FOREIGN KEY ("bicycleId") REFERENCES "Bicycle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FmsLog" ADD CONSTRAINT "FmsLog_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
