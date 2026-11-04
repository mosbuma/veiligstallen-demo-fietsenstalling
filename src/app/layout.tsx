import type { Metadata } from "next";
import { AppNav } from "@/components/AppNav";
import { VeiligstallenSyncBar } from "@/components/VeiligstallenSyncBar";
import { getStallingDisplayName } from "@/lib/fms/metadata-cache";
import { getSettings } from "@/lib/settings";
import "./globals.css";

const FALLBACK_TITLE = "Fietsenstalling demo";

export async function generateMetadata(): Promise<Metadata> {
  const name = await getStallingDisplayName();
  const title = name || FALLBACK_TITLE;
  return {
    title,
    description: "Demo stalling voor FMS v4 (Wilmar)",
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [stallingName, settings] = await Promise.all([getStallingDisplayName(), getSettings()]);
  const heading = stallingName || FALLBACK_TITLE;

  return (
    <html lang="nl">
      <body className="min-h-screen antialiased">
        <div className="mx-auto max-w-[1720px] px-4 py-6">
          <header className="mb-4 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-[var(--accent)]">{heading}</h1>
              <p className="text-sm text-gray-600">
                Balie = lokaal · VeiligStallen batch via knop rechts (of elke 5 min). FMS:{" "}
                <strong>{settings.fmsBaseUrl.replace(/^https?:\/\//, "") || "localhost:3000"}</strong>
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
