import { MonthSelector } from "@/components/MonthSelector";
import { Card, SectionTitle, cx } from "@/components/ui";
import { getCurrentProfileOrNull } from "@/lib/auth";
import { currentMonth, monthLabel, monthRange } from "@/lib/format";
import { PLANNING_META, PLANNING_STATUTS } from "@/lib/constants";
import { joursDuMois, repartitionStatuts } from "@/lib/planning";
import { createClient } from "@/lib/supabase/server";
import type { Planning } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function PlanningPage({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<{ mois?: string }>;
}) {
  const searchParams = await searchParamsPromise;
  const profile = await getCurrentProfileOrNull();
  if (!profile) return null;

  const mois = /^\d{4}-\d{2}$/.test(searchParams.mois ?? "")
    ? (searchParams.mois as string)
    : currentMonth();
  const range = monthRange(mois);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("planning")
    .select("*")
    .eq("vendeur_id", profile.id)
    .gte("date", range.start.slice(0, 10))
    .lt("date", range.end.slice(0, 10));

  if (error) {
    return (
      <div className="space-y-4">
        <SectionTitle>Mon planning</SectionTitle>
        <p className="card p-6 text-sm text-slate-300">
          Planning indisponible ({error.message}). Demandez à
          l&apos;administrateur d&apos;exécuter la migration 003.
        </p>
      </div>
    );
  }

  const planning = (data ?? []) as Planning[];
  const byDate = new Map(planning.map((p) => [p.date, p.statut]));
  const days = joursDuMois(mois);
  const repartition = repartitionStatuts(planning);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      <SectionTitle action={<MonthSelector value={mois} />}>
        Mon planning — {monthLabel(mois)}
      </SectionTitle>

      <div className="grid gap-3 sm:grid-cols-5">
        {PLANNING_STATUTS.map((s) => (
          <Card key={s.key} className="text-center">
            <p className="text-xs text-slate-400">{s.label}</p>
            <p className="mt-1 text-xl font-bold tabular-nums text-white">
              {repartition[s.key]}
            </p>
          </Card>
        ))}
      </div>

      <Card>
        <div className="grid grid-cols-7 gap-1.5 text-center text-xs">
          {days.map((d) => {
            const statut = byDate.get(d);
            const meta = statut ? PLANNING_META[statut] : null;
            return (
              <div
                key={d}
                title={meta?.label}
                className={cx(
                  "flex flex-col items-center justify-center gap-0.5 rounded-md border py-2",
                  meta ? cx("border-transparent", meta.cell) : "border-line/70 text-slate-600",
                  d === today && "ring-1 ring-brand/50",
                )}
              >
                <span className="font-semibold">{Number(d.slice(8, 10))}</span>
                <span className="text-[10px]">{meta?.court ?? "—"}</span>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
