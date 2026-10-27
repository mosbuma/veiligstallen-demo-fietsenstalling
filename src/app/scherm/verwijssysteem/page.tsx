"use client";

import { useEffect, useState } from "react";

export default function VerwijssysteemScherm() {
  const [data, setData] = useState({ free: 0, open: 0, locationName: "" });

  useEffect(() => {
    const tick = () => fetch("/api/display/occupation").then((r) => r.json()).then(setData);
    tick();
    const id = setInterval(tick, 5000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="fixed inset-0 grid grid-cols-2 bg-slate-900 text-white">
      <div className="flex flex-col items-center justify-center border-r border-white/20 p-8">
        <span className="text-xl">IN</span>
        <span className="mt-4 text-5xl font-bold">→</span>
      </div>
      <div className="flex flex-col items-center justify-center p-8">
        <span className="text-xl">UIT</span>
        <span className="mt-4 text-5xl font-bold">←</span>
      </div>
      <div className="col-span-2 bg-[#006633] py-6 text-center">
        <p className="text-2xl font-semibold">{data.locationName}</p>
        <p className="mt-2 text-lg">
          {data.free} vrij · {data.open} fietsen binnen
        </p>
      </div>
    </div>
  );
}
