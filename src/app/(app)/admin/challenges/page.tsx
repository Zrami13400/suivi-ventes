import ChallengeForm from "@/components/ChallengeForm";
import { requireAdmin } from "@/lib/auth";
import { STATUT_META, challengeStatut } from "@/lib/challenges";
import { formatDate, formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { Challenge, Profile } from "@/lib/types";
import { deleteChallenge } from "../actions";

export const dynamic = "force-dynamic";

export default async function AdminChallengesPage() {
  const admin = await requireAdmin();
  const supabase = await createClient();

  const { data: vendeursData } = await supabase
    .from("profiles")
    .select("id, nom_complet, role")
    .eq("shop_id", admin.shop_id)
    .order("nom_complet");
  const vendeurs = ((vendeursData ?? []) as Profile[])
    .filter((p) => p.role === "vendeur")
    .map((p) => ({ id: p.id, nom_complet: p.nom_complet }));
  const nameById = new Map(vendeurs.map((v) => [v.id, v.nom_complet]));

  const { data: challengesData, error } = await supabase
    .from("challenges")
    .select("*")
    .eq("shop_id", admin.shop_id)
    .order("date_debut", { ascending: false });

  const challenges = (challengesData ?? []) as Challenge[];

  return (
    <div className="space-y-6">
      <div className="card p-6">
        <h2 className="text-sm font-semibold text-white">Nouveau challenge</h2>
        {error ? (
          <p className="mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
            Table <code>challenges</code> introuvable — exécutez{" "}
            <code>migrations/002_challenges.sql</code>. ({error.message})
          </p>
        ) : (
          <div className="mt-4">
            <ChallengeForm vendeurs={vendeurs} />
          </div>
        )}
      </div>

      {!error && (
        <div className="card overflow-hidden p-0">
          <h2 className="border-b border-line px-6 py-4 text-sm font-semibold text-white">
            Challenges ({challenges.length})
          </h2>
          {challenges.length === 0 ? (
            <p className="p-6 text-sm text-slate-400">Aucun challenge.</p>
          ) : (
            <ul className="divide-y divide-line/60">
              {challenges.map((c) => {
                const meta = STATUT_META[challengeStatut(c)];
                return (
                  <li
                    key={c.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-6 py-4"
                  >
                    <div>
                      <p className="font-medium text-white">
                        {c.titre}{" "}
                        <span className={`chip ${meta.className}`}>
                          {meta.label}
                        </span>
                      </p>
                      <p className="text-xs text-slate-400">
                        {formatDate(c.date_debut)} → {formatDate(c.date_fin)} ·{" "}
                        {c.metrique === "actes" ? "Tous actes" : c.metrique} ·
                        Bonus {formatMoney(c.prime_bonus)}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {c.participant_ids
                          .map((id) => nameById.get(id) ?? "?")
                          .join(" · ")}
                      </p>
                    </div>
                    <form action={deleteChallenge}>
                      <input type="hidden" name="id" value={c.id} />
                      <button
                        type="submit"
                        className="text-xs font-medium text-rose-400 hover:text-rose-300"
                      >
                        Supprimer
                      </button>
                    </form>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
