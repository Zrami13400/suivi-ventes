"use client";

import { useState, type ReactNode } from "react";
import { cx } from "./ui";

export function Tabs({
  tabs,
}: {
  tabs: { id: string; label: string; content: ReactNode }[];
}) {
  const [active, setActive] = useState(tabs[0]?.id);
  return (
    <div>
      <div className="inline-flex rounded-lg border border-line bg-surface-strong p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActive(t.id)}
            className={cx(
              "rounded-md px-4 py-1.5 text-sm font-medium transition",
              active === t.id
                ? "bg-brand text-white"
                : "text-slate-400 hover:text-white",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="mt-4">
        {tabs.find((t) => t.id === active)?.content}
      </div>
    </div>
  );
}
