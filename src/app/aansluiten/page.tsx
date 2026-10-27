"use client";

import { useEffect, useState } from "react";

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
  const [fmsTest, setFmsTest] = useState<LoginTestResult | null>(null);
  const [rapportageTest, setRapportageTest] = useState<LoginTestResult | null>(null);
  const [saved, setSaved] = useState(false);
  const [testingFms, setTestingFms] = useState(false);
  const [testingRapportage, setTestingRapportage] = useState(false);

  const refreshPools = () => {
    fetch("/api/pools")
      .then((r) => r.json())
      .then((p) => setPools(p));
  };

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((s) =>
        setForm((f) => ({
          ...f,
          fmsBaseUrl: s.fmsBaseUrl ?? f.fmsBaseUrl,
          citycode: s.citycode ?? f.citycode,
          locationId: s.locationId ?? f.locationId,
          dataproviderUsername: s.dataproviderUsername ?? "",
          reportingUsername: s.reportingUsername ?? "",
          passRangeStart: s.passRangeStart ?? f.passRangeStart,
          passRangeEnd: s.passRangeEnd ?? f.passRangeEnd,
          passRangeNext: s.passRangeNext ?? f.passRangeNext,
          barcodeRangeStart: s.barcodeRangeStart ?? f.barcodeRangeStart,
          barcodeRangeEnd: s.barcodeRangeEnd ?? f.barcodeRangeEnd,
          barcodeRangeNext: s.barcodeRangeNext ?? f.barcodeRangeNext,
        }))
      );
    refreshPools();
  }, []);

  const save = async () => {
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    refreshPools();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const testFmsLogin = async () => {
    setTestingFms(true);
    setFmsTest(null);
    const res = await fetch("/api/aansluiten/test-fms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setFmsTest(await parseJsonResponse(res));
    setTestingFms(false);
  };

  const testRapportageLogin = async () => {
    setTestingRapportage(true);
    setRapportageTest(null);
    const res = await fetch("/api/aansluiten/test-rapportage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
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
          De knoppen <strong>Test FMS-login</strong> en <strong>Test rapportage-login</strong> slaan
          eerst op en roepen dan <em>VeiligStallen</em> aan (Basic Auth). Routes op{" "}
          <code>localhost:3077/api/aansluiten/…</code> zijn alleen proxy in deze demo-app.
        </p>
        <p className="rounded border border-amber-200 bg-amber-50 p-3 text-sm">
          Koppeling staat in lokale Postgres. Geen wijzigingen in VeiligStallen-code.
        </p>
        <h3 className="font-semibold">Wat jij in VeiligStallen-beheer regelt</h3>
        <ol className="list-decimal pl-5 text-sm">
          <li>
            Dataleverancier (<code>UrlName</code> + wachtwoord) + FMS rechten (operator of
            dataprovider.type2) op citycode/stalling.
          </li>
          <li>Aparte site-gebruiker voor rapportage (niet het dataprovider-account).</li>
        </ol>
      </div>

      <div className="card grid gap-3 md:grid-cols-2">
        <div>
          <label className="label">FMS base URL (VeiligStallen)</label>
          <input
            className="input"
            value={form.fmsBaseUrl}
            onChange={(e) => setForm({ ...form, fmsBaseUrl: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Citycode</label>
          <input
            className="input"
            value={form.citycode}
            onChange={(e) => setForm({ ...form, citycode: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Location id (StallingsID)</label>
          <input
            className="input"
            value={form.locationId}
            onChange={(e) => setForm({ ...form, locationId: e.target.value })}
          />
        </div>
        <div />
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
            type="password"
            className="input"
            value={form.dataproviderPassword}
            onChange={(e) => setForm({ ...form, dataproviderPassword: e.target.value })}
          />
        </div>
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
            type="password"
            className="input"
            value={form.reportingPassword}
            onChange={(e) => setForm({ ...form, reportingPassword: e.target.value })}
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
          <button
            type="button"
            className="btn btn-primary"
            disabled={testingRapportage}
            onClick={() => void testRapportageLogin()}
          >
            {testingRapportage ? "Bezig…" : "Test rapportage-login"}
          </button>
        </div>
      </div>

      {fmsTest && (
        <div className={`card ${fmsTest.ok ? "border-green-500" : "border-red-400"}`}>
          <p className="font-semibold">FMS dataprovider — HTTP {fmsTest.status}</p>
          <p className="text-sm">{fmsTest.message}</p>
          {fmsTest.endpoint && (
            <p className="mt-2 break-all font-mono text-xs text-gray-600">→ {fmsTest.endpoint}</p>
          )}
        </div>
      )}

      {rapportageTest && (
        <div className={`card ${rapportageTest.ok ? "border-green-500" : "border-red-400"}`}>
          <p className="font-semibold">Rapportage — HTTP {rapportageTest.status}</p>
          <p className="text-sm">{rapportageTest.message}</p>
          {rapportageTest.endpoint && (
            <p className="mt-2 break-all font-mono text-xs text-gray-600">→ {rapportageTest.endpoint}</p>
          )}
        </div>
      )}

      <div className="card space-y-3">
        <h3 className="text-lg font-bold">Lokale ID-pools</h3>
        <p className="text-sm text-gray-600">
          Start en eind moeten overeenkomen met VeiligStallen-beheer. Zet <strong>volgende</strong> op het
          eerstvolgende vrije nummer als de demo halverwege het bereik start.
        </p>
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
            <label className="label">Barcodebereik start / eind / volgende</label>
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
              <p className="mt-1 text-xs text-gray-600">Beschikbaar: {pools.barcode.remaining} barcodes</p>
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
    </div>
  );
}
