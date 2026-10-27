"use client";

import { useEffect, useState } from "react";

export default function InstellingenPage() {
  const [clockOffsetSeconds, setClockOffsetSeconds] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((s) => setClockOffsetSeconds(s.clockOffsetSeconds ?? 0));
  }, []);

  const save = async () => {
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clockOffsetSeconds }),
    });
    setMsg("Klok-offset opgeslagen");
  };

  return (
    <div className="card max-w-md space-y-3">
      <h2 className="text-lg font-bold">Simulatieklok</h2>
      <p className="text-sm text-gray-600">
        Offset t.o.v. systeemtijd voor check-in/out timestamps naar FMS. 0 = echte tijd. Koppeling
        staat op <a href="/aansluiten">Aansluiten</a>.
      </p>
      <div>
        <label className="label">Offset (seconden)</label>
        <input
          type="number"
          className="input"
          value={clockOffsetSeconds}
          onChange={(e) => setClockOffsetSeconds(Number(e.target.value))}
        />
      </div>
      <button type="button" className="btn btn-primary" onClick={() => void save()}>
        Opslaan
      </button>
      {msg && <p className="text-sm">{msg}</p>}
    </div>
  );
}
