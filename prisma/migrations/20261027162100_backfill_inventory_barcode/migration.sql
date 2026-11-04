UPDATE "Visit" v
SET "inventoryBarcode" = b.barcode
FROM "Bicycle" b
WHERE v."bicycleId" = b.id
  AND v.status = 'open'
  AND v."inventoryBarcode" IS NULL
  AND b.barcode IS NOT NULL;
