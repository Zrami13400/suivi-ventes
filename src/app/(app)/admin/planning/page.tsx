import { MonthSelector } from "@/components/MonthSelector";
import PlanningGrid from "@/components/PlanningGrid";
import { SectionTitle } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { currentMonth, monthLabel, monthRange } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { Planning, Profile } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminPlanningPage({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<{ mois?: string }>;
}) {
  const searchParams = await searchParamsPromise;
  const admin = await requireAdmin();
  const mois = /^\d{4}-\d{2}$/.test(searchParams.mois ?? "")
    ? (searchParams.mois as string)
    : currentMonth();
  const range = monthRange(mois);

  const supabase = await createClient();
  const [sellersRes, planningRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, nom_complet, role")
      .eq("shop_id", admin.shop_id)
      .order("nom_complet"),
    supabase
      .from("planning")
      .select("*")
      .eq("shop_id", admin.shop_id)
      .gte("date", range.start.slice(0, 10))
      .lt("date", range.end.slice(0, 10)),
  ]);

  const sellers = ((sellersRes.data ?? []) as Profile[])
    .filter((p) => p.role === "vendeur")
    .map((p) => ({ id: p.id, nom_complet: p.nom_complet }));

  if (planningRes.error) {
    return (
      <div className="space-y-4">
        <SectionTitle>Planning</SectionTitle>
        <p className="card p-6 text-sm text-slate-300">
          Table <code>planning</code> introuvable — exécutez{" "}
          <code>migrations/003_objectifs_planning_paliers.sql</code>.
          <br />
          <span className="text-xs text-slate-500">
            Détail : {planningRes.error.message}
          </span>
        </p>
      </div>
    );
  }

  const planning = (planningRes.data ?? []) as Planning[];

  return (
    <div className="space-y-4">
      <SectionTitle action={<MonthSelector value={mois} />}>
        Planning — {monthLabel(mois)}
      </SectionTitle>
      <PlanningGrid mois={mois} sellers={sellers} initialPlanning={planning} />
    </div>
  );
}
