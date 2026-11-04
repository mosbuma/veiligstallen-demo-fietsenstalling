-- Sleutelhanger ↔ barcode link for open stalling inventaris (local, not FMS saveJsonBike)
ALTER TABLE "Visit" ADD COLUMN "inventoryBarcode" TEXT;
