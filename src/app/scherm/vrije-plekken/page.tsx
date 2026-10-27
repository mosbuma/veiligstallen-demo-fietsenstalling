"use client";

import { useEffect, useState } from "react";

export default function VrijePlekkenScherm() {
  const [data, setData] = useState({ free: 0, capacity: 0, open: 0, locationName: "" });

  useEffect(() => {
    const tick = () => fetch("/api/display/occupation").then((r) => r.json()).then(setData);
    tick();
    const id = setInterval(tick, 5000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-[#006633] text-white">
      <p className="text-2xl uppercase tracking-wide opacity-90">{data.locationName || "Fietsenstalling"}</p>
      <p className="mt-8 text-7xl font-black">{data.free}</p>
      <p className="mt-4 text-3xl">vrije plekken</p>
      <p className="mt-12 text-lg opacity-75">
        bezet {data.open} / {data.capacity}
      </p>
    </div>
  );
}
