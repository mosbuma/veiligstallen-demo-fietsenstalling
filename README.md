# Fietsenstalling demo

Next.js demo app for one bicycle parking location. It leads on check-in, check-out, and occupation, talks to VeiligStallen only through **FMS API v4**, and follows VeiligStallen for stalling metadata (follower mode).

## Requirements

- Node.js 20+
- Docker (Postgres)

## Setup

```bash
cp .env.example .env
docker compose up -d
npm install
npx prisma migrate dev --name init
npm run dev
```

Open [http://localhost:3077/aansluiten](http://localhost:3077/aansluiten). **Aansluiten** (link + credentials + test) lives only in this repo on port **3077**. VeiligStallen on **3000** is used via FMS/rapportage HTTP only — this project does not modify the VeiligStallen app or its database schema.

## Main routes

| Path | Purpose |
| --- | --- |
| `/` | Balie check-in/out |
| `/controle` | Inventory / controle flows |
| `/aansluiten` | VeiligStallen setup, login tests, pass/barcode pools |
| `/periferie` | Tariff, occupation mode, local defaults |
| `/check` | Login + round-trip vs Rapportage API v4 |
| `/financien` | Local ledger + FMS send log |
| `/scherm/*` | Local display boards |

Reference VeiligStallen code lives under `reference/` (read-only).

See [docs/plan-buiten-en-pools.md](docs/plan-buiten-en-pools.md) for the **Buiten** panel, local ID pools, and administratie split.

See [docs/plan-fms-sync.md](docs/plan-fms-sync.md) for FMS sync behavior, **test coverage vs** [reference/endpoints-veiligstallen.md](reference/endpoints-veiligstallen.md), and the planned **link/unlink bike to pass** action (`saveJsonBike`).
