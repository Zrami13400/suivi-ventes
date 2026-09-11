import { Card, EmptyState, ProgressBar, SectionTitle } from "@/components/ui";
import { getCurrentProfileOrNull } from "@/lib/auth";
import { currentMonth, monthLabel, pct, todayISO } from "@/lib/format";
import { OBJECTIF_ACTE_TYPES, ACTE_A_TAUX } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import type { ProgressionObjectif } from "@/lib/types";

export const dynamic = "force-dynamic";

const PERIODE_LABEL: Record<string, string> = {
  jour: "jour",
  semaine: "semaine",
  mois: "mois",
};

export default async function ObjectifsPage() {
  const profile = await getCurrentProfileOrNull();
  if (!profile) return null;

  const today = todayISO();
  const mois = currentMonth();
  const supabase = createClient();

  const { data, error } = await supabase
    .from("progression_objectifs")
    .select("*")
    .eq("shop_id", profile.shop_id)
    .lte("date_debut", today)
    .gte("date_fin", today)
    .or(`vendeur_id.eq.${profile.id},vendeur_id.is.null`);

  const rows = (data ?? []) as ProgressionObjectif[];
  const profileId = profile.id;

  // Pour chaque (acte_type, type_cible, periode) : objectif individuel s'il
  // existe, sinon objectif boutique.
  function pick(
    acte: string,
    typeCible: string,
    periode: string,
  ): { row: ProgressionObjectif; source: "perso" | "boutique" } | null {
    const matches = rows.filter(
      (r) =>
        r.acte_type === acte &&
        r.type_cible === typeCible &&
        r.periode === periode,
    );
    const perso = matches.find((r) => r.vendeur_id === profileId);
    if (perso) return { row: perso, source: "perso" };
    const boutique = matches.find((r) => r.vendeur_id === null);
    if (boutique) return { row: boutique, source: "boutique" };
    return null;
  }

  const periodes = ["mois", "semaine", "jour"];
  const cards = OBJECTIF_ACTE_TYPES.flatMap((acte) => {
    const out: {
      acte: string;
      periode: string;
      volume: ReturnType<typeof pick>;
      taux: ReturnType<typeof pick>;
    }[] = [];
    for (const p of periodes) {
      const volume = pick(acte, "volume", p);
      const taux = ACTE_A_TAUX[acte] ? pick(acte, "taux", p) : null;
      if (volume || taux) out.push({ acte, periode: p, volume, taux });
    }
    return out;
  });

  return (
    <div className="space-y-5">
      <SectionTitle>Mes objectifs — {monthLabel(mois)}</SectionTitle>

      {error && (
        <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          Vue <code>progression_objectifs</code> indisponible ({error.message}).
          Exécutez la migration <code>003_objectifs_planning_paliers.sql</code>.
        </p>
      )}

      {cards.length === 0 ? (
        <EmptyState>
          Aucun objectif actif. L&apos;administrateur peut en définir dans
          l&apos;espace d&apos;administration.
        </EmptyState>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {cards.map(({ acte, periode, volume, taux }) => (
            <Card key={`${acte}-${periode}`}>
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-white">{acte}</h3>
                <span className="chip bg-surface-strong text-slate-400">
                  {PERIODE_LABEL[periode] ?? periode}
                </span>
              </div>

              {volume && (
                <Bloc
                  titre="Volume"
                  source={volume.source}
                  realise={Number(volume.row.volume_realise ?? 0)}
                  cible={Number(volume.row.valeur_cible ?? 0)}
                  suffixe=" actes"
                  jours={volume.row.jours_travailles}
                />
              )}

              {taux && (
                <Bloc
                  titre={`Taux d'attachement (vs ${ACTE_A_TAUX[acte as keyof typeof ACTE_A_TAUX]})`}
                  source={taux.source}
                  realise={Number(taux.row.taux_realise ?? 0)}
                  cible={Number(taux.row.valeur_cible ?? 0)}
                  suffixe=" %"
                  jours={null}
                />
              )}
            </Card>
          ))}
        </div>
      )}

      <p className="text-xs text-slate-500">
        « Boutique » indique un objectif collectif appliqué faute d&apos;objectif
        individuel. Les cibles de période sont proratisées sur tes jours
        travaillés (planning).
      </p>
    </div>
  );
}

function Bloc({
  titre,
  source,
  realise,
  cible,
  suffixe,
  jours,
}: {
  titre: string;
  source: "perso" | "boutique";
  realise: number;
  cible: number;
  suffixe: string;
  jours: number | null;
}) {
  const p = cible > 0 ? pct(realise, cible) : 0;
  return (
    <div className="mt-4">
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-300">{titre}</span>
        <span
          className={`chip ${
            source === "perso"
              ? "bg-brand/15 text-brand-soft"
              : "bg-slate-600/30 text-slate-300"
          }`}
        >
          {source === "perso" ? "Individuel" : "Boutique"}
        </span>
      </div>
      <div className="mt-1.5 flex justify-between text-sm">
        <span className="font-medium tabular-nums text-white">
          {realise}
          {suffixe} / {cible}
          {suffixe}
        </span>
        <span className="text-slate-400">{p}%</span>
      </div>
      <div className="mt-1.5">
        <ProgressBar value={p} />
      </div>
      {jours != null && (
        <p className="mt-1 text-xs text-slate-500">
          {jours} jour(s) travaillé(s) sur la période
        </p>
      )}
    </div>
  );
}
