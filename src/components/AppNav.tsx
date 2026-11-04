"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/aansluiten", label: "Aansluiten" },
  { href: "/", label: "Balie" },
  { href: "/controle", label: "Controle" },
  { href: "/veiligstallen", label: "VeiligStallen" },
  { href: "/administratie", label: "Administratie" },
  { href: "/financien", label: "Financiën" },
  { href: "/check", label: "Check" },
  { href: "/periferie", label: "Periferie" },
  { href: "/instellingen", label: "Klok" },
];

export function AppNav() {
  const pathname = usePathname();
  return (
    <nav className="mb-6 flex flex-wrap gap-2 border-b border-[var(--border)] pb-3 text-sm">
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={
            pathname === l.href
              ? "rounded bg-[var(--accent)] px-2 py-1 font-semibold text-white"
              : "rounded px-2 py-1 hover:bg-white"
          }
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
