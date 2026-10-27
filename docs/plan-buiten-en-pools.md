# Stalling, echte wereld, ID pools

## Definitions

- **Stalling**: all **open** visits (stalling inventory). Columns **Sectie** / **Plaats** show `—` when the bike was **verwijderd zonder scan** (still in inventory, not on the floor).
- **Echte wereld**: bikes with no open visit, plus bikes removed without scan (re-check-in to put them back on the floor).
- **Lumiguide occupation**: only visits with `physicallyPresent === true` count in `countOpenVisits()`.
- **Pool**: local pass/barcode ranges on Aansluiten.

## Balie flows

1. **Check-in** → open visit, on floor, sectie + plaats filled.
2. **Verwijder zonder scan** → visit stays open, `physicallyPresent = false`, bike appears in **Echte wereld**, Stalling row shows `— / —`.
3. **Check-in again** (same barcode) → re-parks on floor (same open visit).
4. **Check-out** → closes visit; bike only in **Echte wereld** (no inventory).

## Auto sector / plaats

On check-in the app picks the **first free place** (1…N) in the first FMS sector that accepts the biketype (`biketypeid` on sector metadata when present). Capacity comes from FMS or `defaultSectionCapacity` (20).

If no sector fits or all places are full → **Overig** (`placementKind: other`): open transaction + FMS managed tx on a fallback sector, **`virtualOccupation`** in direct occupation posts, **not** counted in Lumiguide `occupation`.
