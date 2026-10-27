-- Remove placeholder bicycles without barcodes (demo no longer supports them)
DELETE FROM "Bicycle" WHERE "barcode" IS NULL;

-- AlterTable
ALTER TABLE "Bicycle" ALTER COLUMN "barcode" SET NOT NULL;
