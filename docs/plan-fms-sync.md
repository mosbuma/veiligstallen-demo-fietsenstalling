# FMS sync (demo app)

**Status:** bijgewerkt 2026-10-27 · mapping t.o.v. [`reference/endpoints-veiligstallen.md`](../reference/endpoints-veiligstallen.md) (productie **stallingsbeheer-server**).

De demo is **geen** stallingsbeheer-server: geen `*.wai`-wachtrij, geen SOAP, geen `/v2/*`-clients (WP10, popup, handheld). Alles gaat via **FMS REST v4** vanuit Next.js, met lokale Postgres als bron van waarheid tot je **Update VeiligStallen** drukt (of auto-sync elke **5 min** in de browser).

---

## Wat we wél end-to-end kunnen testen

| Spec (VeiligStallen) | Demo | Hoe testen |
| --- | --- | --- |
| **`uploadJsonTransaction`** | REST `POST …/sections/{sectie}/managedtransactions` (en batch `managedtransactions`, max 50) | Balie/controle in- en uitcheck → **Update VeiligStallen** of wacht op auto-sync → **VeiligStallen**-pagina / FMS-log (`uploadJsonTransaction` / `uploadJsonTransactions`). |
| **`addJsonSaldo`** (debet bij uitcheck met tegoed) | `POST …/idcodes/{type}/{idcode}/balance` met negatief bedrag | Uitcheck met betaling **Saldo (FMS balance)** → sync; log `addJsonSaldo`. Geen lokale saldo-controle vóór uitcheck. |
| **`updateOccupation`** (niet in spec-lijst; wel in demo) | `POST …/sections/{sectie}/occupation` (tellingen Lumiguide) | **Periferie** → occupation mode **direct** of **both** → plaats/verwijder op vloer → batch-sync. Log `updateOccupation`. |
| **`getJsonSectors`** / **`getJsonBikeTypes`** | `GET …/sections`, `GET /api/fms/v4/biketypes` | Pagina laden / **Aansluiten** metadata; cache TTL **5 min** (`GET /api/metadata?force=1`). |
| **`getJsonSubscriptionTypes`** | `GET …/subscriptiontypes` | Zelfde metadata-bundle (types voor administratie-abonnement). |
| **`subscribe`** (handmatig server-UI) | `POST …/subscriptions` | **Administratie → Saldos & abonnement** → abonnement aanmaken; FMS-log `addSubscription`. |
| **`addJsonSaldo`** (handmatig opwaarderen) | zelfde balance-POST | **Administratie → Saldos & abonnement** → opwaarderen. |

---

## Gedeeltelijk testbaar / afwijkend gedrag

| Spec | Limiet in demo |
| --- | --- |
| **`addJsonSaldo` na contant/pin** | Productie: FMS trekt bij uitcheck altijd volledige kosten af; server boekt daarna tegoed terug. Demo stuurt **alleen** saldo-POST bij betaling **saldo**, **niet** de positieve correctie na **contant/pin**. Uitcheck contant/pin lokaal + MT-sync wel; FMS-tegoed-flow uit spec niet. |
| **Controle / inventarisatie → FMS** | **Controle** draait lokaal (Wilmar); FMS krijgt **managed transactions** na sync, geen aparte controle-API. **`syncOccupationInventory`** is stub (alleen `updatedAt` bump voor batch). |
| **Abonnement = gratis stallen** | Logica leest **`getProtectedReadsCached()`** (subscriptions). **`getProtectedReads()` wordt nergens aangeroepen** — cache blijft leeg tenzij handmatig gevuld. Gratis uitcheck via abonnement is in de app **niet betrouwbaar testbaar** tot periodieke pull (10 min) is aangesloten. |
| **Sync-timing** | Spec: wachtrij **20 s**; demo: directe HTTP bij knop / **5 min** auto (browser-tab). Geen offline queue. |
| **Batch vs single MT** | Spec één operatie per wachtrij-item; demo batch (standaard) of **1 transactie per tick** (Aansluiten → sync-modus). |

---

## Nog niet testbaar in deze app

| Spec | Reden |
| --- | --- |
| **`saveJsonBike`** | Alleen `postSaveBike` in code; **geen UI/API** bij incheck/uitcheck of fietsscherm. Zie [Future todo](#future-todo-link--unlink-bike-to-pass). |
| **`syncSector`** (sectorlijst fietsen bij inventarisatie/sluiten) | Niet geïmplementeerd. Demo gebruikt **occupation-tellingen**, geen sector-barcode-lijst. Geen `POST /v2/inventarize/stop`, `isclosed`, popup-verwerking, handheld `setnumberofplaces`. |
| **`getJsonSubscriptors`** | Client `getSubscriptions` bestaat; **geen timer/pull** → geen lokale abonnementenlijst voor balie. |
| **REST balances (15 min)** | Client `getBalances` bestaat; **niet gekoppeld** aan UI of checkout (wel login-test op balances op Aansluiten). |
| **`getJsonBikes` (24 u)** | Geen import FMS-fietsen naar lokale DB. |
| **Clients uit spec** | `CheckInV1`/`CheckOutV1` (WP10), popup (`AddPopupTransactionV1`, …), `POST /v2/bike/{tag}/biketype/{id}`, server-UI fietsscherm. |
| **Overig (WSDL, ongebruikt in productie)** | `getLockerInfo`, `reportJsonOccupationData`, … — demo roept ze ook niet aan. |

---

## Wat we send on check-in / check-out sync

When local **visits** are pushed to VeiligStallen:

| Mode | Managed transactions | Saldo |
| --- | --- | --- |
| **Batch** (main button) | One FMS request `{ "managedtransactions": [ … ] }` on `POST …/locations/{id}/managedtransactions` (max 50 per call, all-or-nothing). | Per visit before the batch POST, if needed. |
| **Single** (auto 5 min) | One `{ "managedtransaction": … }` per tick. | Same as batch, per visit. |
| **Resend** | Single transaction POST. | Same. |

1. **`uploadJsonTransactions`** / **`uploadJsonTransaction`** — check-in/out, sector, costs, barcodes on the MT payload.
2. **`addJsonSaldo`** — only when the visit is closed, paid with saldo, and not subscription-waived.

We do **not** call **`saveJsonBike`** during check-in/out sync. Linking a physical bike (barcode) to a pass in FMS is treated as separate administration, not part of the stallings transaction flow.

## Local inventaris (sleutelhanger ↔ barcode)

While a visit is **open** in stalling inventaris, the demo stores the balie link on the visit:

- **Sleutelhanger** — `Visit.idcode` (pass)
- **Barcode** — `Visit.inventoryBarcode` (set at check-in, cleared at check-out)

Balie and controle (**Stalling** table) use this pair for as long as the bike is in inventaris. That is independent of FMS `saveJsonBike`.

Floor **occupation** uses **`updateOccupation`** (no visit id on those log rows).

## Batch mislukt (HTTP 400)?

1. **Sync-knop / VeiligStallen-pagina** — de foutmelding bevat nu de FMS **`message`** (niet alleen HTTP 400).
2. **VeiligStallen → VeiligStallen-aanroepen** — open de meest recente regel **`uploadJsonTransactions`** (rood) → tab **Response** (volledige JSON) en **Payload** (alle 30 MT’s in één body). FMS batch is **all-or-nothing**: één ongeldige transactie weigert de hele batch; de response noemt meestal het eerste validatieprobleem (bijv. lege `idcode`, onbekende `checkouttype`).
3. Corrigeer lokaal of verwijder testdata, daarna opnieuw **Update VeiligStallen**.

## Open werk (prioriteit t.o.v. spec)

1. **Protected reads** — roep `getProtectedReads()` periodiek aan (metadata-load of server-timer, spec ~10/15 min) zodat abonnement-waiver en saldo-uitcheck testbaar worden.
2. **Contant/pin + FMS tegoed** — na MT-sync positieve `addJsonSaldo` (of productie-equivalent) wanneer klant niet met tegoed betaalt.
3. **`saveJsonBike` UI** — zie below.
4. **`syncSector`** (optioneel) — alleen nodig als je inventarisatie/sluiten 1:1 met stallingsbeheer wilt nabootsen; nu vervangen door occupation + MT’s.

## Future todo: link / unlink bike to pass

Standalone operator action (not balie check-in):

- **Link** — FMS `saveJsonBike`: set `bikeid` + `biketypeid` on an `idcode` (pass).
- **Unlink** — equivalent FMS operation when product/API supports clearing the bike on a pass (confirm endpoint with VeiligStallen docs).

Suggested UI: e.g. **Administratie** or **Aansluiten** — pick pass, pick barcode/biketype, **Koppelen** / **Ontkoppelen**, with FMS log like other calls.

Client helper already exists: `postSaveBike` in `src/lib/fms/client.ts`.
