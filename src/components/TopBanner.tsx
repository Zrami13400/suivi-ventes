import { firstName, formatLongDate, motivation } from "@/lib/format";
import { Avatar } from "./ui";

export function TopBanner({
  nomComplet,
  avatarUrl,
}: {
  nomComplet: string;
  avatarUrl?: string | null;
}) {
  const dateStr = formatLongDate();
  return (
    <div className="card relative overflow-hidden p-5">
      <div className="grad-freebox pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full opacity-20 blur-2xl" />
      <div className="relative flex items-center gap-4">
        <Avatar
          name={nomComplet}
          avatarUrl={avatarUrl}
          size={48}
          className="ring-2 ring-white/10"
        />
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            {dateStr.charAt(0).toUpperCase() + dateStr.slice(1)}
          </p>
          <h1 className="mt-1 text-2xl font-bold text-white">
            Bonjour {firstName(nomComplet)} ! <span aria-hidden>💪</span>
          </h1>
          <p className="mt-1 text-sm text-slate-300">{motivation()}</p>
        </div>
      </div>
    </div>
  );
}
