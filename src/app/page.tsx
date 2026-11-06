"use client";

import { BalieDisplayEmbeds } from "@/components/BalieDisplayEmbeds";
import { BaliePassFmsActions } from "@/components/BaliePassFmsActions";
import { StallingInventoryTable } from "@/components/StallingInventoryTable";
import { useMetadata } from "@/components/MetadataLoader";
import { canonicalPoolPassCode, isSyntheticPassCode, passCodeForInput } from "@/lib/pass-display";
import { stallingHandlesBiketype } from "@/lib/biketype-stalling";
import { useCallback, useEffect, useMemo, useState } from "react";

type Visit = {
  id: string;
  sectionId: string;
  stallPlace: string;
  physicallyPresent: boolean;
  placementKind: string;
  idcode: string;
  checkInType: string;
  status: string;
  checkInDate: string;
  biketypeId: number;
  bicycle?: { barcode: string | null };
};

type OutsideBike = {
  id: string;
  barcode: string;
  biketypeId: number;
  createdAt: string;
  passCode?: string | null;
  visitIdcode?: string | null;
  openVisitId?: string;
  floorPresent?: boolean;
  floorSectionId?: string;
  floorStallPlace?: string;
  floorPlacementKind?: string;
};

type PoolSlice = { remaining: number };

type ScannablePass = {
  passCode: string;
  idType: number;
  hasAbo: boolean;
  openVisit: boolean;
};

type BuitenPanelTab = "fietssticker" | "sleutelhangers";

const BALIE_RANDOM_PASS_KEY = "balie-random-pass";
const GEEN_SLEUTELHANGER_BESCHIKBAAR = "Geen sleutelhanger beschikbaar";

function readBalieRandomPassPref(): boolean {
  if (typeof window === "undefined") return true;
  const v = localStorage.getItem(BALIE_RANDOM_PASS_KEY);
  if (v === null) return true;
  return v === "true";
}

export default function BaliePage() {
  const { biketypes, parkingSections, loading, error } = useMetadata();
  const [passCode, setPassCode] = useState("");
  const [barcode, setBarcode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [barcodeIssueOpen, setBarcodeIssueOpen] = useState(false);
  const [issueBiketypeId, setIssueBiketypeId] = useState(1);
  const [openVisits, setOpenVisits] = useState<Visit[]>([]);
  const [outsideBikes, setOutsideBikes] = useState<OutsideBike[]>([]);
  const [stallingFloorOnly, setStallingFloorOnly] = useState<OutsideBike[]>([]);
  const [payment, setPayment] = useState<"saldo" | "cash" | "pin">("cash");
  const [buitenTypeFilter, setBuitenTypeFilter] = useState<string>("all");
  const [pools, setPools] = useState<{ pass: PoolSlice; barcode: PoolSlice } | null>(null);
  const [randomPass, setRandomPass] = useState(true);
  const [buitenPanelTab, setBuitenPanelTab] = useState<BuitenPanelTab>("fietssticker");
  const [scannablePasses, setScannablePasses] = useState<ScannablePass[]>([]);
  const [passScanInput, setPassScanInput] = useState("");

  const pickRandomPass = useCallback(async () => {
    const poolRes = await fetch("/api/pools");
    const pool = (await poolRes.json()) as { pass: PoolSlice; barcode: PoolSlice };
    setPools(pool);
    const res = await fetch("/api/pools/random-unused-pass");
    const j = (await res.json()) as { passCode?: string | null };
    setPassCode(j.passCode ?? "");
  }, []);

  const loadOpen = useCallback(async () => {
    const res = await fetch("/api/visits?status=open");
    if (!res.ok) {
      setMessage(`Stalling kon niet laden (HTTP ${res.status})`);
      return;
    }
    const j = (await res.json()) as { data?: Visit[] };
    setOpenVisits(j.data ?? []);
  }, []);

  const loadOutside = useCallback(async () => {
    const res = await fetch("/api/bicycles?parked=0");
    if (!res.ok) return;
    const j = (await res.json()) as { data?: OutsideBike[] };
    setOutsideBikes(j.data ?? []);
  }, []);

  const loadStallingFloor = useCallback(async () => {
    const res = await fetch("/api/bicycles?inside=floor");
    if (!res.ok) return;
    const j = (await res.json()) as { data?: OutsideBike[] };
    setStallingFloorOnly(j.data ?? []);
  }, []);

  const loadPools = useCallback(() => {
    fetch("/api/pools")
      .then((r) => r.json())
      .then((p) => setPools(p));
  }, []);

  const loadScannablePasses = useCallback(async () => {
    const res = await fetch("/api/pools/passes");
    if (!res.ok) return;
    const j = (await res.json()) as { passes?: ScannablePass[] };
    setScannablePasses(j.passes ?? []);
  }, []);

  const refreshAll = useCallback(() => {
    void loadOpen();
    void loadOutside();
    void loadStallingFloor();
    loadPools();
    void loadScannablePasses();
    window.dispatchEvent(new Event("local-db-updated"));
  }, [loadOpen, loadOutside, loadStallingFloor, loadPools, loadScannablePasses]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    const on = readBalieRandomPassPref();
    setRandomPass(on);
    if (on) void pickRandomPass();
  }, [pickRandomPass]);

  useEffect(() => {
    if (biketypes[0]) setIssueBiketypeId(biketypes[0].id);
  }, [biketypes]);


  const setRandomPassPersist = (checked: boolean) => {
    setRandomPass(checked);
    localStorage.setItem(BALIE_RANDOM_PASS_KEY, String(checked));
    if (checked) void pickRandomPass();
    else setPassCode("");
  };

  const biketypeName = (id: number) => biketypes.find((b) => b.id === id)?.name ?? String(id);

  const hasUnknownBiketype = useMemo(() => {
    const known = new Set(biketypes.map((b) => b.id));
    return outsideBikes.some((b) => !known.has(b.biketypeId));
  }, [biketypes, outsideBikes]);

  const filteredOutside = useMemo(() => {
    if (buitenTypeFilter === "all") return outsideBikes;
    if (buitenTypeFilter === "other") {
      const known = new Set(biketypes.map((b) => b.id));
      return outsideBikes.filter((b) => !known.has(b.biketypeId));
    }
    const typeId = Number(buitenTypeFilter);
    return outsideBikes.filter((b) => b.biketypeId === typeId);
  }, [buitenTypeFilter, outsideBikes, biketypes]);

  const activeOpenVisit = useMemo(
    () =>
      openVisits.find((v) => {
        const bc = v.bicycle?.barcode;
        return bc && bc === barcode;
      }) ?? null,
    [openVisits, barcode]
  );

  const activeFloorOnlyBike = useMemo(
    () => stallingFloorOnly.find((b) => b.barcode === barcode.trim()) ?? null,
    [stallingFloorOnly, barcode]
  );

  /** Echte wereld: fysiek op stallingvloer (floor / physicallyPresent). */
  const onPhysicalFloor = useMemo(() => {
    const bc = barcode.trim();
    if (!bc) return false;
    if (activeFloorOnlyBike?.floorPresent) return true;
    const v = openVisits.find((x) => x.bicycle?.barcode === bc);
    return Boolean(v?.physicallyPresent);
  }, [barcode, activeFloorOnlyBike, openVisits]);

  const passPoolEmpty = (pools?.pass.remaining ?? 0) === 0;

  const validPassEntered = useMemo(() => {
    const p = passCode.trim();
    return p.length > 0 && !isSyntheticPassCode(p);
  }, [passCode]);

  const hasBarcode = Boolean(barcode.trim());
  const showGeenSleutelhangerBeschikbaar = randomPass && !validPassEntered;
  const highlightSleutelhanger = hasBarcode && !validPassEntered;
  const showCheckIn = validPassEntered && hasBarcode && !activeOpenVisit;
  /** Uitchecken: gescande fiets met open bezoek — geen pas in pool / pasveld nodig. */
  const showCheckOut = hasBarcode && Boolean(activeOpenVisit);
  const showPlaats = validPassEntered && hasBarcode && !onPhysicalFloor;
  const showVerwijder = validPassEntered && hasBarcode && onPhysicalFloor;
  const showBarcodePanel = hasBarcode && (validPassEntered || Boolean(activeOpenVisit));

  const passPoolCanIssue = !passPoolEmpty;

  const afterBalieAction = () => {
    setPassCode("");
    setBarcode("");
    refreshAll();
  };

  const afterCheckInOut = async () => {
    setBarcode("");
    refreshAll();
    if (randomPass) await pickRandomPass();
    else setPassCode("");
  };

  const scanBiketypeId = useMemo((): number | null => {
    const bc = barcode.trim();
    if (!bc) return null;
    const outside = outsideBikes.find((b) => b.barcode === bc);
    if (outside) return outside.biketypeId;
    const floorOnly = stallingFloorOnly.find((b) => b.barcode === bc);
    if (floorOnly) return floorOnly.biketypeId;
    const visit = openVisits.find((v) => v.bicycle?.barcode === bc);
    if (visit) return visit.biketypeId;
    return null;
  }, [barcode, outsideBikes, stallingFloorOnly, openVisits]);

  const scanTypeNotAllowed =
    scanBiketypeId != null && !stallingHandlesBiketype(parkingSections, scanBiketypeId);

  const biketypeIdForActions = scanBiketypeId ?? activeOpenVisit?.biketypeId ?? issueBiketypeId;

  const formatParking = (p?: {
    placementKind?: string;
    sectionId?: string;
    stallPlace?: string;
  }) => {
    if (!p) return "";
    if (p.placementKind === "other") {
      return " · Overig (virtuele bezetting)";
    }
    return ` · ${p.sectionId} / ${p.stallPlace}`;
  };

  const checkIn = async () => {
    setMessage(null);
    const res = await fetch("/api/visits/checkin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passCode, barcode, biketypeId: biketypeIdForActions }),
    });
    const j = await res.json();
    if (!res.ok || !j.ok) {
      setMessage(j.message ?? `Inchecken mislukt (${res.status})`);
      return;
    }
    setMessage(`Ingecheckt (lokaal)${formatParking(j.parking)} · FMS via Update VeiligStallen`);
    await afterCheckInOut();
  };

  const checkOut = async (visitId: string) => {
    setMessage(null);
    const res = await fetch("/api/visits/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visitId, paymentMethod: payment }),
    });
    const j = await res.json();
    if (!res.ok || !j.ok) {
      setMessage(j.message ?? `Uitchecken mislukt (${res.status})`);
      return;
    }
    setMessage(
      `Uitgecheckt (lokaal) · kosten €${Number(j.visit?.stallingskosten ?? 0).toFixed(2)} · FMS via Update VeiligStallen`
    );
    await afterCheckInOut();
  };

  const systemPlace = async () => {
    const res = await fetch("/api/visits/system", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        barcode,
        biketypeId: biketypeIdForActions,
      }),
    });
    const j = await res.json();
    setMessage(j.ok ? "Fiets geplaatst op stallingvloer (geen inventaris)" : j.message ?? "Plaatsen mislukt");
    if (j.ok) afterBalieAction();
    else refreshAll();
  };

  const systemRemove = async () => {
    const res = await fetch("/api/visits/system", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "remove",
        ...(activeOpenVisit ? { visitId: activeOpenVisit.id } : { barcode: barcode.trim() }),
      }),
    });
    const j = await res.json();
    setMessage(j.ok ? "Verwijderd zonder scan (lokaal)" : "Verwijderen mislukt");
    if (j.ok) afterBalieAction();
    else refreshAll();
  };

  const issuePass = async () => {
    setMessage(null);
    const res = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "pass" }),
    });
    const j = await res.json();
    if (j.passCode) {
      setPassCode(j.passCode);
      setMessage(null);
    } else {
      setMessage(j.message ?? "Sleutelhanger uitgeven mislukt");
    }
    loadPools();
  };

  const issueBarcodeForType = async (typeId: number) => {
    setMessage(null);
    const res = await fetch("/api/bicycles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ biketypeId: typeId }),
    });
    const j = await res.json();
    if (j.ok && j.barcode) {
      setBarcode(j.barcode);
      setMessage(`Fietssticker uitgegeven: ${j.barcode} (${biketypeName(typeId)})`);
    } else {
      setMessage(j.message ?? "Fietssticker uitgeven mislukt");
    }
    refreshAll();
  };

  const selectOutsideBarcode = (bike: OutsideBike) => {
    setBarcode(bike.barcode);
  };

  const selectPassAtBalie = useCallback((code: string) => {
    const trimmed = code.trim();
    if (!trimmed || isSyntheticPassCode(trimmed)) return;
    setRandomPass(false);
    localStorage.setItem(BALIE_RANDOM_PASS_KEY, "false");
    setPassCode(canonicalPoolPassCode(trimmed));
    setBuitenPanelTab("fietssticker");
    setPassScanInput("");
  }, []);

  const submitPassScan = () => {
    selectPassAtBalie(passScanInput);
  };

  const buitenTabClass = (t: BuitenPanelTab) =>
    buitenPanelTab === t
      ? "rounded bg-[var(--accent)] px-2 py-0.5 text-xs font-semibold text-white"
      : "rounded px-2 py-0.5 text-xs hover:bg-white";

  const selectInsideVisit = (visit: Visit) => {
    setBarcode(visit.bicycle?.barcode ?? "");
    const fromVisit = passCodeForInput(visit.idcode);
    if (fromVisit) setPassCode(fromVisit);
  };

  const selectFloorOnlyBike = (bike: OutsideBike) => {
    setBarcode(bike.barcode);
  };

  return (
    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
      <div className="grid min-w-0 flex-1 gap-4 xl:grid-cols-12">
      <div className="card space-y-3 xl:col-span-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold">Buiten ({outsideBikes.length})</h2>
          {pools && (
            <span className="text-xs text-gray-600">
              Pool: {pools.pass.remaining} sleutelhangers · {pools.barcode.remaining} fietsstickers
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] pb-2">
          <button
            type="button"
            className={buitenTabClass("fietssticker")}
            onClick={() => setBuitenPanelTab("fietssticker")}
          >
            Fietssticker ({outsideBikes.length})
          </button>
          <button
            type="button"
            className={buitenTabClass("sleutelhangers")}
            onClick={() => setBuitenPanelTab("sleutelhangers")}
          >
            Sleutelhangers ({scannablePasses.length})
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-secondary text-sm"
            onClick={() => setBarcodeIssueOpen(true)}
          >
            Fietssticker uitgeven
          </button>
        </div>
        {barcodeIssueOpen && (
          <div className="space-y-2 rounded border border-amber-300 bg-amber-50 p-3">
            <label className="label">Fietstype nieuwe fiets</label>
            <select
              className="input"
              value={issueBiketypeId}
              onChange={(e) => setIssueBiketypeId(Number(e.target.value))}
            >
              {biketypes.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-primary text-sm"
                onClick={() => {
                  void issueBarcodeForType(issueBiketypeId);
                  setBarcodeIssueOpen(false);
                }}
              >
                Uitgeven
              </button>
              <button
                type="button"
                className="btn btn-secondary text-sm"
                onClick={() => setBarcodeIssueOpen(false)}
              >
                Annuleren
              </button>
            </div>
          </div>
        )}
        {!barcodeIssueOpen && buitenPanelTab === "fietssticker" && (
          <>
            <div>
              <label className="label">Filter fietstype</label>
              <select
                className="input"
                value={buitenTypeFilter}
                onChange={(e) => setBuitenTypeFilter(e.target.value)}
              >
                <option value="all">Alle fietstypes ({outsideBikes.length})</option>
                {biketypes.map((b) => (
                  <option key={b.id} value={String(b.id)}>
                    {b.name}
                  </option>
                ))}
                {hasUnknownBiketype && <option value="other">Overig (onbekend type)</option>}
              </select>
            </div>
            <p className="text-xs text-gray-600">
              Fietsen buiten de stallingvloer (inclusief inventaris zonder fysieke fiets). Klik → fietssticker
              op balie.
            </p>
            <table className="table">
              <thead>
                <tr>
                  <th>Fietssticker</th>
                  <th>Fietstype</th>
                </tr>
              </thead>
              <tbody>
                {filteredOutside.map((b) => {
                  const selected = barcode === b.barcode;
                  return (
                    <tr
                      key={b.id}
                      className={`balie-scan-row ${selected ? "bg-amber-100 ring-1 ring-amber-400" : "hover:bg-slate-50"}`}
                      onClick={() => selectOutsideBarcode(b)}
                    >
                      <td className={`font-mono text-sm ${selected ? "font-semibold" : ""}`}>
                        {b.barcode || "—"}
                      </td>
                      <td className="text-sm">
                        <span
                          className="inline-flex max-w-full items-center gap-0.5"
                          title={
                            b.openVisitId
                              ? "Nog in inventaris (geen fysieke fiets op de vloer)"
                              : undefined
                          }
                        >
                          <span className="min-w-0 truncate">{biketypeName(b.biketypeId)}</span>
                          {b.openVisitId && (
                            <span className="inventaris-warn-icon" aria-hidden>
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.25"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <circle cx="12" cy="12" r="8.25" />
                                <path d="M12 8.25v4.25" />
                                <circle cx="12" cy="15.25" r="0.6" fill="currentColor" stroke="none" />
                              </svg>
                            </span>
                          )}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {filteredOutside.length === 0 && (
                  <tr>
                    <td colSpan={2} className="text-sm text-gray-500">
                      Geen fietsen buiten
                      {buitenTypeFilter !== "all" ? " voor dit filter" : ""}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </>
        )}

        {!barcodeIssueOpen && buitenPanelTab === "sleutelhangers" && (
          <>
            <p className="text-xs text-gray-600">
              Uitgegeven sleutelhangers in het sleutelhangerbereik. Klik of scan → vult nummer op de balie en
              opent tab Fietssticker.
            </p>
            <input
              className="input font-mono text-sm"
              placeholder="Scan sleutelhanger…"
              aria-label="Scan sleutelhanger"
              value={passScanInput}
              onChange={(e) => setPassScanInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submitPassScan();
                }
              }}
            />
            <table className="table">
              <thead>
                <tr>
                  <th>Sleutelhanger</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {scannablePasses.map((p) => {
                  const selected = passCode.trim() === p.passCode;
                  return (
                    <tr
                      key={p.passCode}
                      className={`balie-scan-row ${selected ? "bg-amber-100 ring-1 ring-amber-400" : "hover:bg-slate-50"} ${p.openVisit ? "text-gray-500" : ""}`}
                      onClick={() => selectPassAtBalie(p.passCode)}
                      title={p.openVisit ? "Open inventaris op deze sleutelhanger" : undefined}
                    >
                      <td className={`font-mono text-sm ${selected ? "font-semibold" : ""}`}>
                        {p.passCode}
                        {p.openVisit ? " · in use" : ""}
                      </td>
                      <td className="text-right">
                        {p.hasAbo && (
                          <span className="inline-block rounded-full bg-[var(--accent)] px-2 py-0.5 text-xs font-semibold text-white">
                            abo
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {scannablePasses.length === 0 && (
                  <tr>
                    <td colSpan={2} className="text-sm text-gray-500">
                      Geen sleutelhangers in pool — uitgeven op balie of Administratie
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </>
        )}
      </div>

      <div className="card space-y-3 xl:col-span-4">
        <h2 className="text-lg font-bold">Balie — scan in / uit</h2>
        {loading && <p className="text-sm text-gray-500">Metadata laden…</p>}
        {error && <p className="text-sm text-red-700">{error}</p>}

        <div className="space-y-4">
          <section
            className={`space-y-2 rounded-lg border p-3 ${
              highlightSleutelhanger
                ? "border-amber-500 bg-amber-50/90 ring-2 ring-amber-400"
                : "border-[var(--border)] bg-white/60"
            }`}
          >
            <h3 className="text-sm font-bold text-[var(--accent)]">Sleutelhanger</h3>
            <div>
              <div className="flex flex-wrap items-stretch gap-2">
                {showGeenSleutelhangerBeschikbaar ? (
                  <div
                    id="balie-sleutelhanger"
                    className="flex min-h-[2.25rem] min-w-[8rem] flex-1 items-center rounded-md border border-[var(--border)] bg-white px-[0.6rem] py-[0.45rem] text-sm font-semibold text-[var(--foreground)]"
                    role="status"
                  >
                    {GEEN_SLEUTELHANGER_BESCHIKBAAR}
                  </div>
                ) : (
                  <input
                    id="balie-sleutelhanger"
                    aria-label="Sleutelhanger"
                    className={`input min-w-[8rem] flex-1 font-mono ${randomPass ? "bg-gray-50" : ""}`}
                    value={passCode}
                    onChange={(e) => setPassCode(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter" || randomPass) return;
                      const trimmed = e.currentTarget.value.trim();
                      if (trimmed && !isSyntheticPassCode(trimmed)) {
                        setPassCode(canonicalPoolPassCode(trimmed));
                        setBuitenPanelTab("fietssticker");
                      }
                    }}
                    autoComplete="off"
                    readOnly={randomPass}
                    aria-readonly={randomPass}
                  />
                )}
                <button
                  type="button"
                  className="btn btn-secondary shrink-0 text-sm"
                  disabled={!passPoolCanIssue}
                  title={
                    passPoolCanIssue
                      ? undefined
                      : "Sleutelhangerbereik uitgeput — volgende/eind aan op Aansluiten"
                  }
                  onClick={() => void issuePass()}
                >
                  Sleutelhanger uitgeven
                </button>
              </div>
            </div>
            <BaliePassFmsActions
              passCode={passCode}
              passActive={validPassEntered}
              onFeedback={setMessage}
            />
            {!randomPass && !validPassEntered && passCode.trim() && (
              <p className="text-xs text-amber-800">Geen geldige sleutelhanger (leeg of systeemcode).</p>
            )}
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={randomPass}
                onChange={(e) => setRandomPassPersist(e.target.checked)}
              />
              Willekeurige sleutelhanger (vrij uit pool na in/uitchecken)
            </label>
          </section>

          {showBarcodePanel && (
            <section className="space-y-3 rounded-lg border border-[var(--border)] bg-white/60 p-3">
              <h3 className="text-sm font-bold text-[var(--accent)]">Fietssticker</h3>
              {showCheckOut && !validPassEntered && (
                <p className="text-xs text-gray-600">
                  Open bezoek geselecteerd — uitchecken kan zonder sleutelhanger in te voeren.
                </p>
              )}

              {scanTypeNotAllowed && (
                <div className="rounded bg-red-600 px-3 py-2 text-sm font-semibold text-white">
                  Fietstype niet toegestaan
                </div>
              )}

              <input
                className="input font-mono"
                aria-label="Fietssticker"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
              />
              <p className="text-xs text-gray-600">
                Sector en plaats worden automatisch gekozen (eerste vrije plek). Geen plek →{" "}
                <strong>Overig</strong> (virtuele bezetting).
              </p>
              <div>
                <label className="label">Fietstype (scan)</label>
                <input
                  className="input bg-gray-50"
                  readOnly
                  value={
                    scanBiketypeId != null
                      ? biketypeName(scanBiketypeId)
                      : barcode.trim()
                        ? "Onbekend (geen tag in systeem)"
                        : "—"
                  }
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {showCheckIn && (
                  <button type="button" className="btn btn-primary" onClick={() => void checkIn()}>
                    Check-in
                  </button>
                )}
                {showCheckOut && activeOpenVisit && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => void checkOut(activeOpenVisit.id)}
                  >
                    Check-out
                  </button>
                )}
                {showPlaats && (
                  <button type="button" className="btn btn-secondary" onClick={() => void systemPlace()}>
                    Plaats zonder scan
                  </button>
                )}
                {showVerwijder && (
                  <button type="button" className="btn btn-secondary" onClick={() => void systemRemove()}>
                    Verwijder zonder scan
                  </button>
                )}
              </div>
              {showCheckOut && (
                <div>
                  <label className="label">Betaling bij uit</label>
                  <select
                    className="input"
                    value={payment}
                    onChange={(e) => setPayment(e.target.value as "saldo" | "cash" | "pin")}
                  >
                    <option value="cash">Contant</option>
                    <option value="pin">Pin</option>
                    <option value="saldo">Saldo (FMS balance)</option>
                  </select>
                </div>
              )}
            </section>
          )}
        </div>
        {message && <p className="text-sm font-medium">{message}</p>}
      </div>

      <div className="card min-w-0 xl:col-span-5">
        <StallingInventoryTable
          mode="balie"
          openVisits={openVisits}
          floorOnly={stallingFloorOnly}
          biketypeName={biketypeName}
          selectedBarcode={barcode}
          onScanRow={(bc) => {
            const v = openVisits.find((x) => x.bicycle?.barcode === bc);
            if (v) selectInsideVisit(v);
            else {
              const b = stallingFloorOnly.find((x) => x.barcode === bc);
              if (b) selectFloorOnlyBike(b);
            }
          }}
        />
      </div>
      </div>
      <BalieDisplayEmbeds />
    </div>
  );
}
