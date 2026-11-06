/**
 * Wilmar / stallingsbeheer-server flows mapped to FMS v4 and demo coverage.
 * Sources: reference/endpoints-veiligstallen.md, VS write-sequence-scenarios,
 * fms-write-paths.md, api-write-test-scenarios (subscribe).
 */

export type WilmarFlowStatus = "demo" | "partial" | "missing" | "manual";

export type WilmarFlowItem = {
  id: string;
  cfOrWilmar: string;
  v4Api: string;
  wilmarScenario?: string;
  status: WilmarFlowStatus;
  demoNotes: string;
};

/** Check types Wilmar uses on managed transactions (FMS v4). */
export const WILMAR_CHECK_TYPES = [
  "user",
  "controle",
  "system",
  "sync",
  "reservation",
] as const;

export const WILMAR_FLOW_CATALOG: WilmarFlowItem[] = [
  {
    id: "mt-user-visit",
    cfOrWilmar: "uploadJsonTransaction — balie in/uit (user)",
    v4Api: "POST …/sections/{sectie}/managedtransactions",
    wilmarScenario: "seq-full-visit",
    status: "demo",
    demoNotes: "Balie/controle user MT + stallingskosten/duur bij checkout. Batch/single sync.",
  },
  {
    id: "mt-controle",
    cfOrWilmar: "uploadJsonTransaction — controle (controle)",
    v4Api: "POST …/managedtransactions (checkintype/checkouttype controle)",
    status: "demo",
    demoNotes:
      "Controle afronden → batch sync (MT types + saveJsonBike + saldo bij controle-uit). Stale queue als balie eerder open check-in syncde.",
  },
  {
    id: "mt-system",
    cfOrWilmar: "uploadJsonTransaction — systeem-uitcheck",
    v4Api: "POST …/managedtransactions (checkouttype system)",
    status: "demo",
    demoNotes: "Simulatie-reset: checkouttype system + batch sync (+ lege occupation bij sluiten).",
  },
  {
    id: "sync-checkin",
    cfOrWilmar: "syncSector / inventarisatie — check-in type sync",
    v4Api: "POST …/occupation met data.bikes → new_wachtrij_sync",
    wilmarScenario: "seq-sync-only",
    status: "demo",
    demoNotes:
      "Zelfde POST als inventarisatie; FMS zet Type_checkin=sync als sleutelhanger nog niet geparkeerd. Test: Balie plaats zonder scan (geen incheck) → POST fms-sync inventory-sync-synconly → VS process-queues. Controle finish stuurt alle vloerfietsen (mix ok+sync). occupationMode indirect/both.",
  },
  {
    id: "sync-checkout",
    cfOrWilmar: "Inventarisatie — fiets weg (checkouttype sync)",
    v4Api: "POST …/occupation data.bikes: [] → sync sluit transactie",
    wilmarScenario: "seq-visit-bike-gone",
    status: "demo",
    demoNotes: "Simulatie-reset + POST fms-sync action inventory-empty: lege bikes[] per sectie.",
  },
  {
    id: "sync-inventory-ok",
    cfOrWilmar: "Inventarisatie — fiets nog aanwezig",
    v4Api: "POST …/occupation data.bikes (sleutelhanger nog in lijst)",
    wilmarScenario: "seq-visit-inventory-ok",
    status: "demo",
    demoNotes: "Controle afronden → occupation sync met gescande fietsen op vloer per sectie.",
  },
  {
    id: "save-json-bike",
    cfOrWilmar: "saveJsonBike — sleutelhanger ↔ fiets registreren",
    v4Api: "POST …/idcodes/{type}/{idcode}/bike",
    wilmarScenario: "seq-full-visit (vóór MT)",
    status: "demo",
    demoNotes: "Automatisch vóór MT bij batch/single sync (balie, controle, reset).",
  },
  {
    id: "saldo-debit-checkout",
    cfOrWilmar: "addJsonSaldo — debet bij uitcheck met tegoed",
    v4Api: "POST …/idcodes/{type}/{idcode}/balance (negatief bedrag)",
    wilmarScenario: "seq-saldo (tegenovergesteld: opwaarderen)",
    status: "demo",
    demoNotes: "paymentMethod saldo → negatief bedrag bij sync; balie check tegen cached balances.",
  },
  {
    id: "saldo-credit-cash",
    cfOrWilmar: "addJsonSaldo — tegoed terug na contant/pin",
    v4Api: "POST …/balance (positief bedrag na MT)",
    status: "demo",
    demoNotes: "paymentMethod cash/pin → positief bedrag bij sync (stallingsbeheer-model).",
  },
  {
    id: "saldo-topup",
    cfOrWilmar: "addJsonSaldo — handmatig opwaarderen",
    v4Api: "POST …/balance",
    wilmarScenario: "seq-saldo",
    status: "demo",
    demoNotes: "Balie → Opwaarderen.",
  },
  {
    id: "subscribe-create",
    cfOrWilmar: "Abonnement aanmaken (zonder sleutelhanger / QR-link)",
    v4Api: "POST …/subscriptions { subscription }",
    wilmarScenario: "api-v4-subscribe (stap 1)",
    status: "demo",
    demoNotes:
      "Balie → Abonnement verkopen → modus zonder sleutelhanger (Wilmar stap 1). QR/penning niet in demo.",
  },
  {
    id: "subscribe-link-pass",
    cfOrWilmar: "subscribe — abonnement koppelen aan sleutelhanger",
    v4Api: "POST …/subscriptions/{subscriptionid} { idcode, idtype }",
    wilmarScenario: "api-v4-subscribe (stap 2)",
    status: "demo",
    demoNotes: "Balie → Abonnement koppelen (numeriek id). Vernieuwt subscription-cache voor uitcheck-waiver.",
  },
  {
    id: "koppelpas",
    cfOrWilmar: "koppelpas (location-level)",
    v4Api: "POST …/locations/{id}/idcodes/{type}/{code}",
    status: "demo",
    demoNotes: "Balie → Abonnement koppelen met activeringscode U… (CF subscribe nieuwe flow, idtype 4).",
  },
  {
    id: "occupation-lumiguide",
    cfOrWilmar: "Bezetting tellingen (Lumiguide)",
    v4Api: "POST …/occupation data.occupation",
    wilmarScenario: "seq-lumiguide",
    status: "partial",
    demoNotes: "postFloorOccupation (tellingen); geen data.bikes sync-pad.",
  },
  {
    id: "sync-sector-cf",
    cfOrWilmar: "syncSector (CF v2 lijst fietsen)",
    v4Api: "POST …/occupation data.bikes (equivalent)",
    status: "partial",
    demoNotes: "Zelfde v4-pad als sync-checkin/ok/leeg; geen CF v2 wachtrijbestand.",
  },
  {
    id: "pull-subscriptors",
    cfOrWilmar: "getJsonSubscriptors (timer 10 min)",
    v4Api: "GET …/subscriptions (operator)",
    status: "missing",
    demoNotes: "getSubscriptions client; getProtectedReads() niet periodiek → abonnement-waiver onbetrouwbaar.",
  },
  {
    id: "pull-balances",
    cfOrWilmar: "GET balances (timer 15 min)",
    v4Api: "GET …/locations/{id}/balances",
    status: "missing",
    demoNotes: "Alleen login-test op Aansluiten; geen saldo UI vóór checkout.",
  },
  {
    id: "process-queues",
    cfOrWilmar: "CF processTransactions / VS processQueues",
    v4Api: "GET /api/cron/process-queues (VS)",
    status: "manual",
    demoNotes: "Demo roept VS direct aan; archief/rapportage vereist queue-run op VS (localhost:3000).",
  },
  {
    id: "mt-cost-archief",
    cfOrWilmar: "Stallingskosten in MT → transacties_archief.price",
    v4Api: "managedtransaction.stallingskosten",
    wilmarScenario: "seq-full-visit",
    status: "partial",
    demoNotes: "Demo stuurt stallingskosten; rapportage ziet price na queue+archief. Lokale tariff ≠ FMS tarief.",
  },
  {
    id: "reservation",
    cfOrWilmar: "Reservering (checkintype reservation)",
    v4Api: "POST …/managedtransactions",
    status: "missing",
    demoNotes: "Type toegestaan in toFmsCheckType; geen demo-flow.",
  },
];

export const DEMO_MT_FIELDS_SENT = [
  "externaltransactionid",
  "idcode",
  "idtype",
  "checkindate",
  "checkintype",
  "bikeid_in",
  "biketypeid",
  "sectionid",
  "sectionid_checkin",
  "checkoutdate",
  "checkouttype",
  "stallingsduur",
  "stallingskosten",
  "bikeid_out",
] as const;

export const DEMO_MT_FIELDS_MISSING = [
  "sectionid_out",
  "placeid",
  "externalplaceid",
  "clienttypeid",
  "tariefstaffels",
  "reserveringsduur",
  "passuuid",
] as const;

export function statusLabel(status: WilmarFlowStatus): string {
  switch (status) {
    case "demo":
      return "In demo";
    case "partial":
      return "Gedeeltelijk";
    case "missing":
      return "Ontbreekt";
    case "manual":
      return "Handmatig (VS)";
  }
}
