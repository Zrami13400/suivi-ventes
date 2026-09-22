import type { ReactNode } from "react";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cx("card p-5", className)}>{children}</div>;
}

export function SectionTitle({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-4">
      <h2 className="text-base font-semibold text-white">{children}</h2>
      {action}
    </div>
  );
}

export function ProgressBar({
  value,
  className,
  tone = "brand",
}: {
  value: number;
  className?: string;
  tone?: "brand" | "emerald" | "sky" | "violet" | "amber";
}) {
  const tones: Record<string, string> = {
    brand: "bg-brand",
    emerald: "bg-emerald-400",
    sky: "bg-sky-400",
    violet: "bg-violet-400",
    amber: "bg-amber-400",
  };
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      className={cx(
        "h-2 w-full overflow-hidden rounded-full bg-white/10",
        className,
      )}
    >
      <div
        className={cx(
          "h-full rounded-full transition-all duration-500",
          v >= 100 ? "bg-emerald-400" : tones[tone],
        )}
        style={{ width: `${v}%` }}
      />
    </div>
  );
}

export function Stat({
  label,
  value,
  sub,
  className,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("card p-5", className)}>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-2 text-2xl font-bold tabular-nums text-white">{value}</p>
      {sub != null && <div className="mt-1 text-sm text-slate-400">{sub}</div>}
    </div>
  );
}

export function Avatar({
  name,
  avatarUrl,
  size = 40,
  className,
}: {
  name: string;
  avatarUrl?: string | null;
  size?: number;
  className?: string;
}) {
  const initials = (name || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");

  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt={name}
        className={cx("shrink-0 rounded-full object-cover", className)}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      className={cx(
        "grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand to-violet-500 font-semibold text-white",
        className,
      )}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {initials}
    </span>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="card-soft p-6 text-sm text-slate-400">{children}</div>
  );
}
