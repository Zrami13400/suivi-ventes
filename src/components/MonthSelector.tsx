"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { monthLabel } from "@/lib/format";

/** Sélecteur de mois (12 derniers mois) qui met à jour `?mois=AAAA-MM`. */
export function MonthSelector({ value }: { value: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const options: string[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    options.push(d.toISOString().slice(0, 7));
  }

  return (
    <select
      className="field w-auto"
      value={value}
      onChange={(e) => {
        const next = new URLSearchParams(params);
        next.set("mois", e.target.value);
        router.push(`${pathname}?${next.toString()}`);
      }}
    >
      {options.map((m) => (
        <option key={m} value={m}>
          {monthLabel(m)}
        </option>
      ))}
    </select>
  );
}
