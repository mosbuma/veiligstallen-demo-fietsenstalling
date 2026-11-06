"use client";

import { readFmsSyncMode, writeFmsSyncMode, type FmsSyncMode } from "@/lib/fms-sync-mode";
import { useCallback, useEffect, useMemo, useState } from "react";

type CatalogCity = {
  citycode: string;
  name: string;
  locations: { locationid: string; name: string }[];
};

type SavedProfile = {
  id: string;
  label: string;
  citycode: string;
  locationId: string;
};

type LoginTestResult = {
  ok: boolean;
  status: number;
  message: string;
  endpoint?: string;
};

type PoolSlice = { start: number; end: number; next: number; remaining: number };

async function parseJsonResponse(res: Response): Promise<LoginTestResult> {
  const text = await res.text();
  try {
    return text
      ? (JSON.parse(text) as LoginTestResult)
      : { ok: false, status: res.status, message: "Leeg antwoord van demo-server" };
  } catch {
    return {
      ok: false,
      status: res.status,
      message: `Demo-server HTTP ${res.status} (geen JSON)`,
    };
  }
}

function LoginTestResultPanel({ title, result }: { title: string; result: LoginTestResult }) {
  return (
    <div
      role="status"
      className={`rounded-lg border-2 px-5 py-4 ${
        result.ok ? "border-green-600 bg-green-50" : "border-red-500 bg-red-50"
      }`}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">Testresultaat</p>
      <p className="mt-1 font-semibold">
        {title} — HTTP {result.status}
      </p>
      <p className="text-sm">{result.message}</p>
      {result.endpoint && (
        <p className="mt-2 break-all font-mono text-xs text-gray-600">→ {result.endpoint}</p>
      )}
    </div>
  );
}

export default function AansluitenPage() {
  const [form, setForm] = useState({
    fmsBaseUrl: "http://localhost:3000",
    citycode: "9933",
    locationId: "9933_001",
    dataproviderUsername: "",
    dataproviderPassword: "",
    reportingUsername: "",
    reportingPassword: "",
    passRangeStart: 1000,
    passRangeEnd: 1999,
    passRangeNext: 1000,
    barcodeRangeStart: 200000,
    barcodeRangeEnd: 299999,
    barcodeRangeNext: 200000,
  });
  const [pools, setPools] = useState<{ pass: PoolSlice; barcode: PoolSlice } | null>(null);
  const [stallingTest, setStallingTest] = useState<LoginTestResult | null>(null);
  const [fmsTest, setFmsTest] = useState<LoginTestResult | null>(null);
  const [rapportageTest, setRapportageTest] = useState<LoginTestResult | null>(null);
  const [saved, setSaved] = useState(false);
  const [testingStalling, setTestingStalling] = useState(false);
  const [testingFms, setTestingFms] = useState(false);
  const [testingRapportage, setTestingRapportage] = useState(false);
  const [fmsSyncMode, setFmsSyncMode] = useState<FmsSyncMode>("batch");
  const [beheerClearPasses, setBeheerClearPasses] = useState(false);
  const [beheerClearBicycles, setBeheerClearBicycles] = useState(false);
  const [beheerResetStalling, setBeheerResetStalling] = useState(false);
  const [beheerLoading, setBeheerLoading] = useState(false);
  const [beheerResult, setBeheerResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [stallingProfileId, setStallingProfileId] = useState("");
  const [savedProfiles, setSavedProfiles] = useState<SavedProfile[]>([]);
  const [catalog, setCatalog] = useState<CatalogCity[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const refreshPools = () => {
    fetch("/api/pools")
      .then((r) => r.json())
      .then((p) => setPools(p));
  };

  const applySettingsToForm = useCallback((s: Record<string, unknown>) => {
    setForm((f) => ({
      ...f,
      fmsBaseUrl: (s.fmsBaseUrl as string) ?? f.fmsBaseUrl,
      citycode: (s.citycode as string) ?? f.citycode,
      locationId: (s.locationId as string) ?? f.locationId,
      dataproviderUsername: (s.dataproviderUsername as string) ?? "",
      dataproviderPassword: "",
      reportingUsername: (s.reportingUsername as string) ?? "",
      reportingPassword: "",
      passRangeStart: (s.passRangeStart as number) ?? f.passRangeStart,
      passRangeEnd: (s.passRangeEnd as number) ?? f.passRangeEnd,
      passRangeNext: (s.passRangeNext as number) ?? f.passRangeNext,
      barcodeRangeStart: (s.barcodeRangeStart as number) ?? f.barcodeRangeStart,
      barcodeRangeEnd: (s.barcodeRangeEnd as number) ?? f.barcodeRangeEnd,
      barcodeRangeNext: (s.barcodeRangeNext as number) ?? f.barcodeRangeNext,
    }));
    if (s.stallingProfileId) setStallingProfileId(String(s.stallingProfileId));
  }, []);

  const loadProfiles = useCallback(async () => {
    const r = await fetch("/api/stalling-profiles");
    const j = (await r.json()) as { profiles?: SavedProfile[]; activeProfileId?: string };
    setSavedProfiles(j.profiles ?? []);
    if (j.activeProfileId) setStallingProfileId(j.activeProfileId);
  }, []);

  const loadCatalog = useCallback(async (baseUrl: string) => {
    const trimmed = baseUrl.trim();
    if (!trimmed) return;
    setCatalogLoading(true);
    setCatalogError(null);
    const r = await fetch(`/api/aansluiten/fms-catalog?baseUrl=${encodeURIComponent(trimmed)}`);
    const j = (await r.json()) as { ok?: boolean; cities?: CatalogCity[]; message?: string };
    setCatalogLoading(false);
    if (!j.ok) {
      setCatalog([]);
      setCatalogError(j.message ?? "FMS-catalogus laden mislukt");
      return;
    }
    setCatalog(j.cities ?? []);
  }, []);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((s) => applySettingsToForm(s as Record<string, unknown>));
    refreshPools();
    void loadProfiles();
  }, [applySettingsToForm, loadProfiles]);

  useEffect(() => {
    setFmsSyncMode(readFmsSyncMode());
  }, []);

  useEffect(() => {
    void loadCatalog(form.fmsBaseUrl);
  }, [form.fmsBaseUrl, loadCatalog]);

  const locationsForCity = useMemo(() => {
    return catalog.find((c) => c.citycode === form.citycode)?.locations ?? [];
  }, [catalog, form.citycode]);

  const switchProfile = async (profileId: string) => {
    if (!profileId || profileId === stallingProfileId) return;
    const res = await fetch("/api/stalling-profiles/switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId }),
    });
    const j = (await res.json()) as { settings?: Record<string, unknown> };
    if (j.settings) applySettingsToForm(j.settings);
    await loadProfiles();
    refreshPools();
    setStallingTest(null);
    setFmsTest(null);
    setRapportageTest(null);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("local-db-updated"));
    }
  };

  const save = async () => {
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const s = await fetch("/api/settings").then((r) => r.json());
    applySettingsToForm(s as Record<string, unknown>);
    await loadProfiles();
    refreshPools();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const connectionPayload = () => ({
    fmsBaseUrl: form.fmsBaseUrl,
    citycode: form.citycode,
    locationId: form.locationId,
  });

  const testStallingConfig = async () => {
    setTestingStalling(true);
    setStallingTest(null);
    const res = await fetch("/api/aansluiten/test-stalling", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(connectionPayload()),
    });
    setStallingTest(await parseJsonResponse(res));
    setTestingStalling(false);
  };

  const testFmsLogin = async () => {
    setTestingFms(true);
    setFmsTest(null);
    const res = await fetch("/api/aansluiten/test-fms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...connectionPayload(),
        dataproviderUsername: form.dataproviderUsername,
        dataproviderPassword: form.dataproviderPassword,
      }),
    });
    setFmsTest(await parseJsonResponse(res));
    setTestingFms(false);
  };

  const runSimulationReset = async () => {
    if (!beheerClearPasses && !beheerClearBicycles && !beheerResetStalling) {
      setBeheerResult({ ok: false, message: "Kies minstens één optie." });
      return;
    }
    const summary = [
      beheerResetStalling ? "stalling reset (uitchecken, FMS-sync, historie wissen)" : null,
      beheerClearPasses ? "alle sleutelhangers verwijderen" : null,
      beheerClearBicycles ? "alle fietsrecords verwijderen" : null,
    ]
      .filter(Boolean)
      .join(", ");
    if (
      !confirm(
        `Simulatie resetten?\n\n${summary}\n\nDit kan niet ongedaan worden gemaakt in deze demo-database.`
      )
    ) {
      return;
    }
    setBeheerLoading(true);
    setBeheerResult(null);
    const res = await fetch("/api/aansluiten/reset-simulation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clearPasses: beheerClearPasses,
        clearBicycles: beheerClearBicycles,
        resetStalling: beheerResetStalling,
      }),
    });
    const j = (await res.json()) as { ok?: boolean; message?: string };
    setBeheerLoading(false);
    setBeheerResult({ ok: j.ok !== false, message: j.message ?? (res.ok ? "Klaar" : "Mislukt") });
    refreshPools();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("local-db-updated"));
    }
  };

  const testRapportageLogin = async () => {
    setTestingRapportage(true);
    setRapportageTest(null);
    const res = await fetch("/api/aansluiten/test-rapportage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...connectionPayload(),
        reportingUsername: form.reportingUsername,
        reportingPassword: form.reportingPassword,
      }),
    });
    setRapportageTest(await parseJsonResponse(res));
    setTestingRapportage(false);
  };

  return (
    <div className="space-y-4">
      <div className="card prose prose-sm max-w-none">
        <h2 className="text-xl font-bold">Aansluiten (alleen in deze app)</h2>
        <p className="rounded border border-[var(--border)] bg-slate-50 p-3 text-sm">
          <strong>Poorten:</strong> fietsenstalling-demo op <code>http://localhost:3077</code> ·
          VeiligStallen op <code>http://localhost:3000</code> (FMS base URL).
        </p>
        <p className="text-sm">
          Elke testknop slaat alleen <em>zijn</em> velden op en doet één check op VeiligStallen.{" "}
          <strong>Test stalling</strong> gebruikt open FMS-catalogus (geen login); login-tests gebruiken Basic Auth.
          Routes op <code>localhost:3077/api/aansluiten/…</code> zijn proxy in deze demo-app.
        </p>
        <p className="rounded border border-amber-200 bg-amber-50 p-3 text-sm">
          Koppeling staat in lokale Postgres. Geen wijzigingen in VeiligStallen-code.
        </p>
        <h3 className="font-semibold">Wat jij in VeiligStallen-beheer regelt</h3>
        <p className="text-sm">
          Log in op VeiligStallen (<code>http://localhost:3000</code>) en kies bovenaan de actieve organisatie:
          de <strong>gemeente</strong> die bij je <strong>citycode</strong> hoort (bij teststand:{" "}
          <strong>testgemeente API</strong>).
        </p>
        <p className="text-sm">
          Vul op deze pagina hetzelfde in als in beheer: <strong>Citycode</strong> = gemeente-{" "}
          <strong>ZipID</strong> (bijv. <code>9933</code>); <strong>Location id</strong> ={" "}
          <strong>StallingsID</strong> (bijv. <code>9933_001</code>); dataprovider ={" "}
          <strong>UrlName</strong> + wachtwoord; rapportage = site-<strong>gebruikersnaam</strong> + wachtwoord
          (niet de UrlName).
        </p>
        <h4 className="mt-3 text-sm font-semibold">1. Stalling en citycode</h4>
        <ul className="list-disc pl-5 text-sm">
          <li>
            <strong>Fietsenstallingen</strong> — controleer <strong>StallingsID</strong> = Location id hieronder.
          </li>
          <li>
            FMS-<strong>citycode</strong> is de <strong>ZipID</strong> van die gemeente; moet gelijk zijn aan het
            veld Citycode op deze pagina.
          </li>
          <li>
            Gebruik <strong>Test stalling</strong> (geen login) om base URL, citycode en StallingsID te verifiëren.
          </li>
        </ul>
        <h4 className="mt-3 text-sm font-semibold">2. Dataprovider (FMS / demo-sync)</h4>
        <ul className="list-disc pl-5 text-sm">
          <li>
            <strong>Fietsberaad → Contacten → Dataleveranciers</strong> — <strong>UrlName</strong> exact gelijk aan{" "}
            <em>Dataprovider gebruikersnaam</em>; wachtwoord instellen of resetten daar.
          </li>
          <li>
            <strong>Gemeente → Toegang FMS-service</strong> — koppeling voor deze gemeente/stalling met minimaal{" "}
            <strong>dataprovider.type2</strong> of <strong>operator</strong>.
          </li>
          <li>
            Controleer met <strong>Test FMS-login</strong> hieronder. HTTP <strong>403 op balances</strong> kan nog{" "}
            <strong>OK</strong> zijn (type2 zonder saldo-read).
          </li>
        </ul>
        <h4 className="mt-3 text-sm font-semibold">3. Rapportage-gebruiker</h4>
        <ul className="list-disc pl-5 text-sm">
          <li>
            <strong>Gemeente → Gebruikers</strong> — controleer dat een gebruiker bestaat wiens{" "}
            <strong>gebruikersnaam</strong> exact overeenkomt met <em>Rapportage gebruiker</em>.
          </li>
          <li>
            Wachtwoord niet zichtbaar in de lijst: instellen of resetten in dat scherm, daarna{" "}
            <strong>Test rapportage-login</strong> op deze pagina.
          </li>
        </ul>
      </div>

      <div className="card grid gap-3 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className="label">Actieve simulatie (opgeslagen stalling)</label>
          <select
            className="input"
            value={stallingProfileId}
            onChange={(e) => void switchProfile(e.target.value)}
          >
            {savedProfiles.length === 0 && <option value="">—</option>}
            {savedProfiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-600">
            Elke opgeslagen stalling heeft eigen lokale sleutelhangers, fietsen en transacties. Wisselen laadt andere
            aansluitgegevens; balie/controle tonen alleen data van de actieve simulatie.
          </p>
        </div>
        <div>
          <label className="label">FMS base URL (VeiligStallen)</label>
          <input
            className="input"
            value={form.fmsBaseUrl}
            onChange={(e) => setForm({ ...form, fmsBaseUrl: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Catalogus</label>
          <p className="text-sm text-gray-600">
            {catalogLoading
              ? "FMS-catalogus laden…"
              : catalogError
                ? catalogError
                : `${catalog.length} data-eigenaar(s) uit VeiligStallen`}
          </p>
        </div>
        <div>
          <label className="label">Data-eigenaar (citycode / ZipID)</label>
          <select
            className="input"
            value={form.citycode}
            onChange={(e) => {
              const citycode = e.target.value;
              const locs = catalog.find((c) => c.citycode === citycode)?.locations ?? [];
              const locationId =
                locs.some((l) => l.locationid === form.locationId) && form.locationId
                  ? form.locationId
                  : (locs[0]?.locationid ?? "");
              setForm({ ...form, citycode, locationId });
            }}
          >
            {!catalog.some((c) => c.citycode === form.citycode) && form.citycode && (
              <option value={form.citycode}>{form.citycode} (niet in catalogus)</option>
            )}
            {catalog.map((c) => (
              <option key={c.citycode} value={c.citycode}>
                {c.citycode} — {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Stalling (StallingsID)</label>
          <select
            className="input"
            value={form.locationId}
            onChange={(e) => setForm({ ...form, locationId: e.target.value })}
          >
            {locationsForCity.length === 0 && form.locationId && (
              <option value={form.locationId}>{form.locationId} (niet in catalogus)</option>
            )}
            {locationsForCity.map((loc) => (
              <option key={loc.locationid} value={loc.locationid}>
                {loc.locationid} — {loc.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap items-end gap-2 md:col-span-2">
          <button
            type="button"
            className="btn btn-primary"
            disabled={testingStalling}
            onClick={() => void testStallingConfig()}
          >
            {testingStalling ? "Bezig…" : "Test stalling"}
          </button>
        </div>
        {stallingTest && (
          <div className="md:col-span-2">
            <LoginTestResultPanel title="Stalling (FMS catalogus)" result={stallingTest} />
          </div>
        )}
        <div>
          <label className="label">Dataprovider gebruikersnaam (UrlName)</label>
          <input
            className="input"
            value={form.dataproviderUsername}
            onChange={(e) => setForm({ ...form, dataproviderUsername: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Dataprovider wachtwoord</label>
          <input
            type="text"
            className="input"
            name="dataprovider-password"
            autoComplete="off"
            data-1p-ignore
            data-lpignore="true"
            spellCheck={false}
            placeholder="Leeg = behoud opgeslagen wachtwoord"
            value={form.dataproviderPassword}
            onChange={(e) => setForm({ ...form, dataproviderPassword: e.target.value })}
          />
        </div>
        <div className="flex flex-wrap items-end gap-2 md:col-span-2">
          <button
            type="button"
            className="btn btn-primary"
            disabled={testingFms}
            onClick={() => void testFmsLogin()}
          >
            {testingFms ? "Bezig…" : "Test FMS-login (dataprovider)"}
          </button>
        </div>
        {fmsTest && (
          <div className="md:col-span-2">
            <LoginTestResultPanel title="FMS dataprovider" result={fmsTest} />
          </div>
        )}
        <div>
          <label className="label">Rapportage gebruiker (site account)</label>
          <input
            className="input"
            value={form.reportingUsername}
            onChange={(e) => setForm({ ...form, reportingUsername: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Rapportage wachtwoord</label>
          <input
            type="text"
            className="input"
            name="reporting-password"
            autoComplete="off"
            data-1p-ignore
            data-lpignore="true"
            spellCheck={false}
            placeholder="Leeg = behoud opgeslagen wachtwoord"
            value={form.reportingPassword}
            onChange={(e) => setForm({ ...form, reportingPassword: e.target.value })}
          />
        </div>
        <div className="flex flex-wrap items-end gap-2 md:col-span-2">
          <button
            type="button"
            className="btn btn-primary"
            disabled={testingRapportage}
            onClick={() => void testRapportageLogin()}
          >
            {testingRapportage ? "Bezig…" : "Test rapportage-login"}
          </button>
        </div>
        {rapportageTest && (
          <div className="md:col-span-2">
            <LoginTestResultPanel title="Rapportage" result={rapportageTest} />
          </div>
        )}
      </div>

      <div className="card space-y-3">
        <h3 className="text-lg font-bold">Lokale ID-pools</h3>
        <p className="text-sm text-gray-600">
          Start en eind moeten overeenkomen met VeiligStallen-beheer. Zet <strong>volgende</strong> op het
          eerstvolgende vrije nummer als de demo halverwege het bereik start.
        </p>
        <h3 className="text-lg font-bold">VeiligStallen sync (deze browser)</h3>
        <p className="text-sm text-gray-600">
          Staat in <code>localStorage</code> op dit apparaat. Alleen de <strong>automatische sync elke 5 min</strong>{" "}
          volgt deze instelling. De knop <strong>Update VeiligStallen</strong> stuurt altijd alle openstaande
          transacties in één keer.
        </p>
        <fieldset className="space-y-2 text-sm">
          <legend className="sr-only">Sync-modus</legend>
          <label className="flex cursor-pointer items-start gap-2">
            <input
              type="radio"
              name="fms-sync-mode"
              className="mt-1"
              checked={fmsSyncMode === "batch"}
              onChange={() => {
                writeFmsSyncMode("batch");
                setFmsSyncMode("batch");
              }}
            />
            <span>
              <strong>Batch</strong> — alle pending transacties in één FMS-batchcall (max 50), daarna bezetting.
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-2">
            <input
              type="radio"
              name="fms-sync-mode"
              className="mt-1"
              checked={fmsSyncMode === "single"}
              onChange={() => {
                writeFmsSyncMode("single");
                setFmsSyncMode("single");
              }}
            />
            <span>
              <strong>Enkel</strong> — bij auto-sync één transactie per keer (oudste eerst); bezetting pas als er
              geen transacties meer openstaan.
            </span>
          </label>
        </fieldset>
      </div>

      <div className="card space-y-3">
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="label">Pasbereik start / eind / volgende</label>
            <div className="flex gap-2">
              <input
                type="number"
                className="input"
                value={form.passRangeStart}
                onChange={(e) => setForm({ ...form, passRangeStart: Number(e.target.value) })}
              />
              <input
                type="number"
                className="input"
                value={form.passRangeEnd}
                onChange={(e) => setForm({ ...form, passRangeEnd: Number(e.target.value) })}
              />
              <input
                type="number"
                className="input"
                value={form.passRangeNext}
                onChange={(e) => setForm({ ...form, passRangeNext: Number(e.target.value) })}
              />
            </div>
            {pools && (
              <p className="mt-1 text-xs text-gray-600">Beschikbaar: {pools.pass.remaining} passen</p>
            )}
          </div>
          <div>
            <label className="label">Fietsstickerbereik start / eind / volgende</label>
            <div className="flex gap-2">
              <input
                type="number"
                className="input"
                value={form.barcodeRangeStart}
                onChange={(e) => setForm({ ...form, barcodeRangeStart: Number(e.target.value) })}
              />
              <input
                type="number"
                className="input"
                value={form.barcodeRangeEnd}
                onChange={(e) => setForm({ ...form, barcodeRangeEnd: Number(e.target.value) })}
              />
              <input
                type="number"
                className="input"
                value={form.barcodeRangeNext}
                onChange={(e) => setForm({ ...form, barcodeRangeNext: Number(e.target.value) })}
              />
            </div>
            {pools && (
              <p className="mt-1 text-xs text-gray-600">Beschikbaar: {pools.barcode.remaining} fietsstickers</p>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-primary" onClick={() => void save()}>
          Opslaan
        </button>
        {saved && <span className="text-sm text-green-700">Opgeslagen</span>}
      </div>

      <div className="card space-y-3 border-red-200">
        <h3 className="text-lg font-bold text-red-900">Beheer — simulatie resetten</h3>
        <p className="text-sm text-gray-600">
          Alleen lokale Postgres in deze demo. FMS-credentials en pool-instellingen blijven staan; kies wat je wilt
          wissen.
        </p>
        <fieldset className="space-y-2 text-sm">
          <legend className="sr-only">Reset-opties</legend>
          <label className="flex cursor-pointer items-start gap-2">
            <input
              type="checkbox"
              className="mt-1"
              checked={beheerResetStalling}
              onChange={(e) => setBeheerResetStalling(e.target.checked)}
            />
            <span>
              <strong>Stalling-data resetten</strong> — alle open bezoeken uitchecken (systeem), alle pending
              transacties naar VeiligStallen sturen (batch), daarna alle lokale transacties en FMS-log wissen en vloer
              leegmaken. Batch-status op aansluiten wordt gereset.
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-2">
            <input
              type="checkbox"
              className="mt-1"
              checked={beheerClearPasses}
              onChange={(e) => setBeheerClearPasses(e.target.checked)}
            />
            <span>
              <strong>Sleutelhangers wissen</strong> — alle sleutelhangers en gekoppelde accounts verwijderen (standaard uit).
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-2">
            <input
              type="checkbox"
              className="mt-1"
              checked={beheerClearBicycles}
              onChange={(e) => setBeheerClearBicycles(e.target.checked)}
            />
            <span>
              <strong>Fietsen wissen</strong> — alle fietsrecords in de database verwijderen (standaard uit). Bij
              stalling-reset zonder deze optie blijven fietsrecords bestaan maar worden van de vloer gehaald.
            </span>
          </label>
        </fieldset>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="btn btn-secondary border-red-300 text-red-900"
            disabled={beheerLoading}
            onClick={() => void runSimulationReset()}
          >
            {beheerLoading ? "Bezig…" : "Reset uitvoeren"}
          </button>
        </div>
        {beheerResult && (
          <p
            className={`text-sm font-medium ${beheerResult.ok ? "text-green-800" : "text-amber-900"}`}
            role="status"
          >
            {beheerResult.message}
          </p>
        )}
      </div>
    </div>
  );
}
