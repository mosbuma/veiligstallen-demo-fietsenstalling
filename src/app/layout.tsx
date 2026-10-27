import type { Metadata } from "next";
import { AppNav } from "@/components/AppNav";
import { VeiligstallenSyncBar } from "@/components/VeiligstallenSyncBar";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fietsenstalling demo",
  description: "Demo stalling voor FMS v4 (Wilmar)",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <body className="min-h-screen antialiased">
        <div className="mx-auto max-w-7xl px-4 py-6">
          <header className="mb-4 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-[var(--accent)]">Fietsenstalling demo</h1>
              <p className="text-sm text-gray-600">
                Balie = lokaal · VeiligStallen batch via knop rechts (of elke 5 min). FMS:{" "}
                <strong>localhost:3000</strong>
              </p>
            </div>
            <VeiligstallenSyncBar />
          </header>
          <AppNav />
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
