import { ActeIcon } from "@/components/ActeIcon";
import { LiveRefresh } from "@/components/LiveRefresh";
import { Card, ProgressBar, SectionTitle, cx } from "@/components/ui";
import { getCurrentProfileOrNull } from "@/lib/auth";
import { currentMonth, monthLabel, monthRange, pct, todayISO } from "@/lib/format";
import { tauxAttachement } from "@/lib/kpi";
import { CATEGORIES, type ActeType } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import type { ProgressionObjectif, Vente } from "@/lib/types";

export const dynamic = "force-dynamic";

const PERIODE_LABEL: Record<string, string> = {
  jour: "Jour",
  semaine: "Semaine",
  mois: "Mois",
};
const PERIODES = ["mois", "semaine", "jour"] as const;

type OptionKey = "McAfee" | "Assurance";
/** Options suivies en sous-objectif, rattachées à leur type d'acte parent. */
const OPTIONS_PAR_ACTE: Partial<Record<ActeType, { key: OptionKey; label: string }>> = {
  Freebox: { key: "McAfee", label: "McAfee" },
  Téléphone: { key: "Assurance", label: "Assurance mobile" },
};

/** Unité affichée à la place de « actes » : [singulier, pluriel]. */
const UNITE_PAR_ACTE: Record<ActeType, [string, string]> = {
  Freebox: ["Freebox", "Freebox"],
  "Forfait mobile": ["forfait", "forfaits"],
  Téléphone: ["téléphone", "téléphones"],
};
const unite = (acte: ActeType, n: number) => UNITE_PAR_ACTE[acte][Math.abs(n) > 1 ? 1 : 0];

type Source = "perso" | "boutique";
interface Choix {
  row: ProgressionObjectif;
  source: Source;
}

export default async function ObjectifsPage() {
  const profile = await getCurrentProfileOrNull();
  if (!profile) return null;

  const today = todayISO();
  const mois = currentMonth();
  const range = monthRange(mois);
  const supabase = await createClient();

  const [progRes, ventesRes] = await Promise.all([
    supabase
      .from("progression_objectifs")
      .select("*")
      .eq("shop_id", profile.shop_id)
      .lte("date_debut", today)
      .gte("date_fin", today)
      .or(`vendeur_id.eq.${profile.id},vendeur_id.is.null`),
    supabase
      .from("ventes")
      .select("*")
      .eq("vendeur_id", profile.id)
      .eq("statut", "validée")
      .gte("created_at", range.start)
      .lt("created_at", range.end),
  ]);

  const rows = (progRes.data ?? []) as ProgressionObjectif[];
  const ventesMois = (ventesRes.data ?? []) as Vente[];
  const profileId = profile.id;

  // Objectif individuel s'il existe, sinon objectif boutique.
  function pick(acte: string, typeCible: string, periode: string): Choix | null {
    const matches = rows.filter(
      (r) => r.acte_type === acte && r.type_cible === typeCible && r.periode === periode,
    );
    const perso = matches.find((r) => r.vendeur_id === profileId);
    if (perso) return { row: perso, source: "perso" };
    const boutique = matches.find((r) => r.vendeur_id === null);
    return boutique ? { row: boutique, source: "boutique" } : null;
  }
  /** Première période disponible, du mois au jour. */
  const pickAny = (acte: string, typeCible: string) =>
    PERIODES.map((p) => pick(acte, typeCible, p)).find(Boolean) ?? null;

  const realiseMois = (acte: ActeType) =>
    ventesMois.reduce((s, v) => (v.acte_type === acte ? s + v.quantity : s), 0);

  return (
    <div className="space-y-5">
      <LiveRefresh vendeurId={profile.id} shopId={profile.shop_id} />
      <SectionTitle>Mes objectifs — {monthLabel(mois)}</SectionTitle>

      {progRes.error && (
        <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          Vue <code>progression_objectifs</code> indisponible ({progRes.error.message}).
          Exécutez la migration <code>003_objectifs_planning_paliers.sql</code>.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {CATEGORIES.map((c) => {
          const volumes = PERIODES.map((p) => ({ periode: p, obj: pick(c.acte, "volume", p) })).filter(
            (x): x is { periode: (typeof PERIODES)[number]; obj: Choix } => x.obj != null,
          );
          const option = OPTIONS_PAR_ACTE[c.acte];
          return (
            <Card key={c.key} className="overflow-hidden">
              <div className={cx("-m-5 mb-4 flex items-center gap-2 p-4 text-white", c.grad)}>
                <ActeIcon acte={c.acte} />
                <h3 className="font-semibold uppercase tracking-wide">{c.label}</h3>
                <span className="ml-auto text-sm opacity-90">
                  {realiseMois(c.acte)} ce mois
                </span>
              </div>

              {volumes.length === 0 ? (
                <MainBar
                  titre="Volume — mois"
                  realise={realiseMois(c.acte)}
                  cible={null}
                  unite={(n) => ` ${unite(c.acte, n)}`}
                />
              ) : (
                <div className="space-y-4">
                  {volumes.map(({ periode, obj }) => (
                    <MainBar
                      key={periode}
                      titre={`Volume — ${PERIODE_LABEL[periode].toLowerCase()}`}
                      source={obj.source}
                      realise={Number(obj.row.volume_realise ?? 0)}
                      cible={Number(obj.row.valeur_cible ?? 0)}
                      unite={(n) => ` ${unite(c.acte, n)}`}
                      jours={obj.row.jours_travailles}
                    />
                  ))}
                </div>
              )}

              {option && (
                <OptionBlock
                  label={option.label}
                  optionKey={option.key}
                  parent={c.acte}
                  ventesMois={ventesMois}
                  taux={pickAny(option.key, "taux")}
                  volume={pickAny(option.key, "volume")}
                />
              )}
            </Card>
          );
        })}
      </div>

      <p className="text-xs text-slate-500">
        « Boutique » indique un objectif collectif appliqué faute d&apos;objectif
        individuel. Les cibles de période sont proratisées sur tes jours
        travaillés (planning). Le taux d&apos;une option = ventes avec
        l&apos;option ÷ ventes du type d&apos;acte parent ce mois-ci.
      </p>
    </div>
  );
}

function SourceChip({ source }: { source: Source }) {
  return (
    <span
      className={cx(
        "chip",
        source === "perso" ? "bg-brand/15 text-brand-soft" : "bg-slate-600/30 text-slate-300",
      )}
    >
      {source === "perso" ? "Individuel" : "Boutique"}
    </span>
  );
}

function MainBar({
  titre,
  source,
  realise,
  cible,
  unite: uniteDe,
  jours,
}: {
  titre: string;
  source?: Source;
  realise: number;
  cible: number | null;
  unite: (n: number) => string;
  jours?: number | null;
}) {
  const aCible = cible != null && cible > 0;
  const p = aCible ? pct(realise, cible) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-300">{titre}</span>
        {source && <SourceChip source={source} />}
      </div>
      <div className="mt-1.5 flex items-baseline justify-between text-sm">
        <span className="font-medium tabular-nums text-white">
          {realise}
          {uniteDe(realise)}
          {aCible && (
            <span className="text-slate-400">
              {" "}
              / {cible}
              {uniteDe(cible)}
            </span>
          )}
        </span>
        {aCible ? (
          <span className="text-lg font-bold tabular-nums text-white">{p}%</span>
        ) : (
          <span className="text-xs text-slate-500">Aucun objectif défini</span>
        )}
      </div>
      <div className="mt-1.5">
        {aCible ? <ProgressBar value={p} /> : <div className="h-2 w-full rounded-full bg-white/10" />}
      </div>
      {jours != null && (
        <p className="mt-1 text-xs text-slate-500">{jours} jour(s) travaillé(s) sur la période</p>
      )}
    </div>
  );
}

function OptionBlock({
  label,
  optionKey,
  parent,
  ventesMois,
  taux,
  volume,
}: {
  label: string;
  optionKey: OptionKey;
  parent: ActeType;
  ventesMois: Vente[];
  taux: Choix | null;
  volume: Choix | null;
}) {
  const t = tauxAttachement(ventesMois, optionKey);
  const cibleTaux = taux ? Number(taux.row.valeur_cible ?? 0) : 0;
  return (
    <div className="mt-5 space-y-3 border-t border-line/60 pt-4">
      <OptionBar
        titre={`${label} — taux`}
        source={taux?.source}
        periode={taux ? PERIODE_LABEL[taux.row.periode] : null}
        realise={t.taux}
        cible={cibleTaux > 0 ? cibleTaux : null}
        suffixe="%"
        detail={`${t.attaches} / ${t.base} ${unite(parent, t.base)} ce mois`}
      />
      {volume && (
        <OptionBar
          titre={`${label} — volume`}
          source={volume.source}
          periode={PERIODE_LABEL[volume.row.periode]}
          realise={Number(volume.row.volume_realise ?? 0)}
          cible={Number(volume.row.valeur_cible ?? 0) || null}
          suffixe=""
        />
      )}
    </div>
  );
}

/** Sous-objectif d'option : barre fine, icône, couleur secondaire. */
function OptionBar({
  titre,
  source,
  periode,
  realise,
  cible,
  suffixe,
  detail,
}: {
  titre: string;
  source?: Source;
  periode?: string | null;
  realise: number;
  cible: number | null;
  suffixe: string;
  detail?: string;
}) {
  const p = cible ? pct(realise, cible) : 0;
  // Sans objectif : barre neutre à hauteur du réalisé (en % si c'est un taux).
  const width = cible ? p : suffixe === "%" ? Math.min(100, realise) : 0;
  return (
    <div className="pl-3">
      <div className="flex items-center gap-1.5 text-xs">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-3.5 w-3.5 shrink-0 text-violet-300"
          aria-hidden
        >
          <path d="M12 3l8 3v6c0 5-3.5 7.5-8 9-4.5-1.5-8-4-8-9V6l8-3Z" />
        </svg>
        <span className="text-slate-300">{titre}</span>
        {periode && <span className="text-slate-500">· {periode.toLowerCase()}</span>}
        {source && (
          <span className="ml-auto">
            <SourceChip source={source} />
          </span>
        )}
      </div>
      <div className="mt-1 flex items-baseline justify-between text-xs">
        <span className="tabular-nums text-white">
          {realise}
          {suffixe}
          {cible != null && (
            <span className="text-slate-400">
              {" "}
              / {cible}
              {suffixe}
            </span>
          )}
        </span>
        {cible != null ? (
          <span className="font-semibold tabular-nums text-violet-200">{p}%</span>
        ) : (
          <span className="text-slate-500">Aucun objectif défini</span>
        )}
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className={cx(
            "h-full rounded-full transition-all duration-500",
            cible == null ? "bg-slate-500" : p >= 100 ? "bg-emerald-400" : "bg-violet-400",
          )}
          style={{ width: `${Math.max(0, Math.min(100, Math.round(width)))}%` }}
        />
      </div>
      {detail && <p className="mt-0.5 text-[11px] text-slate-500">{detail}</p>}
    </div>
  );
}
