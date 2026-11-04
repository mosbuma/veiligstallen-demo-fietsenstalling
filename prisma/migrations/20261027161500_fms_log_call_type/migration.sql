ALTER TABLE "FmsLog" ADD COLUMN "callType" TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE "FmsLog" ADD COLUMN "ok" BOOLEAN NOT NULL DEFAULT false;

UPDATE "FmsLog"
SET "callType" = CASE
  WHEN "path" LIKE '%managedtransactions%' THEN 'uploadJsonTransaction'
  WHEN "path" LIKE '%/balance%' THEN 'addJsonSaldo'
  WHEN "path" LIKE '%/occupation%' THEN 'updateOccupation'
  WHEN "path" LIKE '%/subscriptions%' THEN 'addSubscription'
  WHEN "path" LIKE '%/bike%' THEN 'saveJsonBike'
  ELSE 'unknown'
END,
"ok" = COALESCE("statusCode" >= 200 AND "statusCode" < 300, false);
