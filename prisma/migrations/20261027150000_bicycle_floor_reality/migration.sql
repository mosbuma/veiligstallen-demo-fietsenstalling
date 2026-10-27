-- Real world (physical floor) vs stalling inventory (Visit) separation
ALTER TABLE "Bicycle" ADD COLUMN "floorPresent" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Bicycle" ADD COLUMN "floorSectionId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Bicycle" ADD COLUMN "floorStallPlace" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Bicycle" ADD COLUMN "floorPlacementKind" TEXT NOT NULL DEFAULT 'assigned';
ALTER TABLE "Bicycle" ADD COLUMN "floorFmsSectionId" TEXT NOT NULL DEFAULT '';

-- Migrate physical presence from open visits onto bicycles, then drop system-only inventory
UPDATE "Bicycle" b
SET
  "floorPresent" = true,
  "floorSectionId" = v."sectionId",
  "floorStallPlace" = v."stallPlace",
  "floorPlacementKind" = v."placementKind",
  "floorFmsSectionId" = v."fmsSectionId"
FROM "Visit" v
WHERE v."bicycleId" = b.id
  AND v.status = 'open'
  AND v."physicallyPresent" = true;

-- System placements never were real stalling inventory: close those open visits
UPDATE "Visit"
SET status = 'closed', "checkOutType" = 'system_migrate', "checkOutDate" = NOW()
WHERE status = 'open' AND "checkInType" = 'system';
