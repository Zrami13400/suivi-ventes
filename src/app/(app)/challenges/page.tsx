import { ChallengeCard } from "@/components/ChallengeCard";
import { Card, EmptyState, SectionTitle, Avatar } from "@/components/ui";
import { getCurrentProfileOrNull } from "@/lib/auth";
import { challengeStandings, challengeStatut } from "@/lib/challenges";
import { todayISO } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { Challenge, ChallengeStatut, Profile, Vente } from "@/lib/types";

export const dynamic = "force-dynamic";

const SECTIONS: { statut: ChallengeStatut; label: string }[] = [
  { statut: "en_cours", label: "En cours" },
  { statut: "a_venir", label: "À venir" },
  { statut: "termine", label: "Terminés" },
];

export default async function ChallengesPage() {
  const profile = await getCurrentProfileOrNull();
  if (!profile) return null;
  const supabase = createClient();

  const { data: sellersData } = await supabase
    .from("profiles")
    .select("*")
    .eq("shop_id", profile.shop_id);
  const sellers = (sellersData ?? []) as Profile[];
  const sellersById = new Map(sellers.map((s) => [s.id, s]));

  const { data: challengesData, error } = await supabase
    .from("challenges")
    .select("*")
    .eq("shop_id", profile.shop_id)
    .order("date_debut", { ascending: false });

  if (error) {
    return (
      <div className="space-y-4">
        <SectionTitle>Challenges</SectionTitle>
        <Card>
          <p className="text-sm text-slate-300">
            La table <code>challenges</code> n&apos;existe pas encore. Exécutez la
            migration <code>migrations/002_challenges.sql</code> dans le SQL Editor
            de Supabase pour activer cette section.
          </p>
          <p className="mt-2 text-xs text-slate-500">Détail : {error.message}</p>
        </Card>
      </div>
    );
  }

  const challenges = (challengesData ?? []) as Challenge[];

  let ventes: Vente[] = [];
  if (challenges.length > 0) {
    const minDebut = challenges.reduce(
      (m, c) => (c.date_debut < m ? c.date_debut : m),
      challenges[0].date_debut,
    );
    const maxFin = challenges.reduce(
      (m, c) => (c.date_fin > m ? c.date_fin : m),
      challenges[0].date_fin,
    );
    const { data: ventesData } = await supabase
      .from("ventes")
      .select("*")
      .eq("shop_id", profile.shop_id)
      .eq("statut", "validée")
      .gte("created_at", `${minDebut}T00:00:00`)
      .lte("created_at", `${maxFin}T23:59:59`);
    ventes = (ventesData ?? []) as Vente[];
  }

  const today = todayISO();

  // Palmarès : nombre de challenges terminés remportés par vendeur.
  const wins = new Map<string, number>();
  for (const c of challenges) {
    if (challengeStatut(c, today) !== "termine") continue;
    const st = challengeStandings(c, ventes, sellersById);
    if (st[0] && st[0].score > 0) {
      wins.set(st[0].vendeurId, (wins.get(st[0].vendeurId) ?? 0) + 1);
    }
  }
  const palmares = Array.from(wins.entries())
    .map(([id, n]) => ({ vendeur: sellersById.get(id) ?? null, n }))
    .sort((a, b) => b.n - a.n);

  return (
    <div className="space-y-6">
      <SectionTitle
        action={
          profile.role === "admin" ? (
            <a href="/admin/challenges" className="btn-ghost">
              Gérer les challenges
            </a>
          ) : undefined
        }
      >
        Challenges
      </SectionTitle>

      {challenges.length === 0 ? (
        <EmptyState>
          Aucun challenge pour le moment.
          {profile.role === "admin" && " Créez-en un depuis l'administration."}
        </EmptyState>
      ) : (
        <>
          {palmares.length > 0 && (
            <Card>
              <SectionTitle>Palmarès</SectionTitle>
              <ul className="space-y-2">
                {palmares.map((p, i) => (
                  <li
                    key={p.vendeur?.id ?? i}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="flex items-center gap-2 text-white">
                      <span className="w-5 tabular-nums text-slate-400">
                        {i + 1}
                      </span>
                      <Avatar name={p.vendeur?.nom_complet ?? "?"} size={24} />
                      {p.vendeur?.nom_complet ?? "Vendeur"}
                    </span>
                    <span className="font-semibold text-amber-300">
                      {p.n} 🏆
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {SECTIONS.map(({ statut, label }) => {
            const list = challenges.filter(
              (c) => challengeStatut(c, today) === statut,
            );
            if (list.length === 0) return null;
            return (
              <div key={statut}>
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
                  {label} ({list.length})
                </h3>
                <div className="grid gap-4 lg:grid-cols-2">
                  {list.map((c) => (
                    <ChallengeCard
                      key={c.id}
                      challenge={c}
                      ventes={ventes}
                      sellersById={sellersById}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
