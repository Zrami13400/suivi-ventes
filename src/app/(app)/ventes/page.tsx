import type { ReactNode } from "react";
import Link from "next/link";
import { AnnulerVenteButton } from "@/components/AnnulerVenteButton";
import { LiveRefresh } from "@/components/LiveRefresh";
import { Card, EmptyState, SectionTitle, cx } from "@/components/ui";
import { getCurrentProfileOrNull } from "@/lib/auth";
import { formatMoney, todayISO } from "@/lib/format";
import { ligneCommission, optionsCochees, priceBook, totalActes } from "@/lib/kpi";
import { ACTE_TYPES, categoryForActe, isActeType, type ActeType } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import type {
  ModeleTelephone,
  OptionFlat,
  ReglePrime,
  SousTypeActe,
  Vente,
} from "@/lib/types";

export const dynamic = "force-dynamic";

const OPTION_CHIP = [
  "bg-violet-500/15 text-violet-200",
  "bg-emerald-500/15 text-emerald-200",
  "bg-sky-500/15 text-sky-200",
  "bg-amber-500/15 text-amber-200",
  "bg-fuchsia-500/15 text-fuchsia-200",
];

const PERIODES = [
  { key: "jour", label: "Aujourd'hui" },
  { key: "semaine", label: "Cette semaine" },
  { key: "mois", label: "Ce mois" },
  { key: "perso", label: "Personnalisé" },
] as const;
type PeriodeKey = (typeof PERIODES)[number]["key"];

const STATUTS = [
  { key: "toutes", label: "Toutes" },
  { key: "validees", label: "Validées" },
  { key: "annulees", label: "Annulées" },
] as const;
type StatutFiltre = (typeof STATUTS)[number]["key"];

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Bornes [début, fin] incluses (AAAA-MM-JJ) de la période filtrée. */
function resolvePeriode(
  p: PeriodeKey,
  today: string,
  du?: string,
  au?: string,
): { start: string; end: string } {
  if (p === "jour") return { start: today, end: today };
  if (p === "semaine") {
    const dow = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7; // lundi = 0
    return { start: addDays(today, -dow), end: today };
  }
  const debutMois = `${today.slice(0, 7)}-01`;
  if (p === "perso") {
    const start = du && ISO_DAY.test(du) ? du : debutMois;
    const end = au && ISO_DAY.test(au) ? au : today;
    return start <= end ? { start, end } : { start: end, end: start };
  }
  return { start: debutMois, end: today };
}

function formatJour(day: string): string {
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short" }).format(
    new Date(`${day}T00:00:00Z`),
  );
}

export default async function VentesPage({
  searchParams,
}: {
  searchParams: { p?: string; du?: string; au?: string; acte?: string; s?: string };
}) {
  const profile = await getCurrentProfileOrNull();
  if (!profile) return null;

  const today = todayISO();
  const periode: PeriodeKey = PERIODES.some((x) => x.key === searchParams.p)
    ? (searchParams.p as PeriodeKey)
    : "mois";
  const acte: ActeType | null =
    searchParams.acte && isActeType(searchParams.acte) ? searchParams.acte : null;
  const statutFiltre: StatutFiltre = STATUTS.some((x) => x.key === searchParams.s)
    ? (searchParams.s as StatutFiltre)
    : "toutes";
  const { start, end } = resolvePeriode(periode, today, searchParams.du, searchParams.au);
  const isAdmin = profile.role === "admin";

  const supabase = createClient();
  let ventesQuery = supabase
    .from("ventes")
    .select("*")
    .eq("vendeur_id", profile.id)
    .gte("created_at", `${start}T00:00:00Z`)
    .lt("created_at", `${addDays(end, 1)}T00:00:00Z`)
    .order("created_at", { ascending: false });
  if (acte) ventesQuery = ventesQuery.eq("acte_type", acte);

  const [ventesRes, sousTypesRes, reglesRes, modelesRes, optionsRes] = await Promise.all([
    ventesQuery,
    supabase.from("sous_types_actes").select("*").eq("shop_id", profile.shop_id),
    supabase.from("regles_primes").select("*").eq("shop_id", profile.shop_id),
    supabase.from("modeles_telephones").select("*").eq("shop_id", profile.shop_id),
    supabase.from("options_flat").select("*").eq("shop_id", profile.shop_id),
  ]);

  const ventes = (ventesRes.data ?? []) as Vente[];
  const pb = priceBook(
    (sousTypesRes.data ?? []) as SousTypeActe[],
    (reglesRes.data ?? []) as ReglePrime[],
    (modelesRes.data ?? []) as ModeleTelephone[],
    optionsRes.error ? null : ((optionsRes.data ?? []) as OptionFlat[]),
  );

  const toutes = ventes.map((v) => {
    const modele = v.modele_id ? pb.modeles.get(v.modele_id) : undefined;
    const sousType = v.sous_type_id ? pb.sousTypes.get(v.sous_type_id) : undefined;
    const produit = modele
      ? `${modele.marque} ${modele.nom}`.trim()
      : sousType?.nom ?? null;
    const annulee = v.statut === "annulée";
    const d = new Date(v.created_at);
    return {
      v,
      produit,
      annulee,
      commission: ligneCommission(v, pb),
      // Vendeur : ses ventes du jour seulement ; admin : toutes (cf. RLS 008).
      annulable: !annulee && (isAdmin || v.created_at.slice(0, 10) === today),
      options: optionsCochees(v, pb),
      date: d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: "Europe/Paris" }),
      heure: d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }),
    };
  });
  const lignes = toutes.filter((l) =>
    statutFiltre === "validees" ? !l.annulee : statutFiltre === "annulees" ? l.annulee : true,
  );

  // Totaux : ventes validées uniquement, quel que soit le filtre de statut.
  const validees = toutes.filter((l) => !l.annulee);
  const nbAnnulees = toutes.length - validees.length;
  const nbActes = totalActes(validees.map((l) => l.v));
  const totalCommission = validees.reduce((s, l) => s + l.commission, 0);

  const href = (patch: Record<string, string | null>) => {
    const q = new URLSearchParams();
    const merged: Record<string, string | null | undefined> = {
      p: periode,
      acte,
      s: statutFiltre === "toutes" ? null : statutFiltre,
      du: periode === "perso" ? start : null,
      au: periode === "perso" ? end : null,
      ...patch,
    };
    for (const [k, val] of Object.entries(merged)) if (val) q.set(k, val);
    return `/ventes?${q.toString()}`;
  };

  const optionChip = (o: OptionFlat) =>
    OPTION_CHIP[Math.max(0, pb.options.indexOf(o)) % OPTION_CHIP.length];

  return (
    <div className="space-y-5">
      <LiveRefresh vendeurId={profile.id} shopId={profile.shop_id} />
      <SectionTitle>Mes ventes / Actes</SectionTitle>

      {/* Filtres */}
      <Card className="space-y-3">
        <FilterRow label="Période">
          {PERIODES.map((x) => (
            <FilterChip
              key={x.key}
              href={href({ p: x.key, du: null, au: null })}
              active={periode === x.key}
            >
              {x.label}
            </FilterChip>
          ))}
        </FilterRow>
        {periode === "perso" && (
          <form key={`${start}_${end}`} action="/ventes" className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="p" value="perso" />
            {acte && <input type="hidden" name="acte" value={acte} />}
            {statutFiltre !== "toutes" && <input type="hidden" name="s" value={statutFiltre} />}
            <label className="text-xs text-slate-400">
              Du
              <input type="date" name="du" defaultValue={start} max={today} className="field mt-1" />
            </label>
            <label className="text-xs text-slate-400">
              Au
              <input type="date" name="au" defaultValue={end} max={today} className="field mt-1" />
            </label>
            <button type="submit" className="btn-primary">
              Appliquer
            </button>
          </form>
        )}
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          <FilterRow label="Type d'acte">
            <FilterChip href={href({ acte: null })} active={acte === null}>
              Tous
            </FilterChip>
            {ACTE_TYPES.map((a) => (
              <FilterChip key={a} href={href({ acte: a })} active={acte === a}>
                {a}
              </FilterChip>
            ))}
          </FilterRow>
          <FilterRow label="Statut">
            {STATUTS.map((x) => (
              <FilterChip
                key={x.key}
                href={href({ s: x.key === "toutes" ? null : x.key })}
                active={statutFiltre === x.key}
              >
                {x.label}
              </FilterChip>
            ))}
          </FilterRow>
        </div>
      </Card>

      {/* Totaux (ventes validées) */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Total actes
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-white">{nbActes}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {validees.length} vente{validees.length > 1 ? "s" : ""} validée
            {validees.length > 1 ? "s" : ""}
          </p>
        </Card>
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Commission
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-amber-300">
            {formatMoney(totalCommission)}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {start === end ? formatJour(start) : `${formatJour(start)} → ${formatJour(end)}`}
          </p>
        </Card>
      </div>
      {nbAnnulees > 0 && (
        <p className="-mt-2 text-xs text-slate-500">
          {nbAnnulees} vente{nbAnnulees > 1 ? "s" : ""} annulée{nbAnnulees > 1 ? "s" : ""} sur
          la période, non comptée{nbAnnulees > 1 ? "s" : ""} dans les totaux.
        </p>
      )}

      {ventesRes.error && (
        <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          Impossible de charger les ventes ({ventesRes.error.message}).
        </p>
      )}

      {lignes.length === 0 ? (
        <EmptyState>
          Aucune vente sur cette période. Les actes s&apos;enregistrent depuis
          l&apos;onglet{" "}
          <Link href="/dashboard" className="text-brand-soft underline">
            Accueil
          </Link>
          .
        </EmptyState>
      ) : (
        <>
          {/* Desktop : tableau */}
          <Card className="hidden p-0 md:block">
            <div className="scrollbar-thin overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-line text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">Acte</th>
                    <th className="px-4 py-3 font-medium">Produit</th>
                    <th className="px-4 py-3 text-right font-medium">Qté</th>
                    <th className="px-4 py-3 font-medium">Options</th>
                    <th className="px-4 py-3 text-right font-medium">Commission</th>
                    <th className="px-4 py-3 font-medium">Statut</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {lignes.map((l) => (
                    <tr key={l.v.id} className={cx(l.annulee && "opacity-50")}>
                      <td className="whitespace-nowrap px-4 py-2.5 text-slate-400">
                        {l.date} <span className="text-slate-500">· {l.heure}</span>
                      </td>
                      <td className={cx("whitespace-nowrap px-4 py-2.5", l.annulee && "line-through")}>
                        <ActeLabel acte={l.v.acte_type} />
                      </td>
                      <td className={cx("px-4 py-2.5 text-slate-300", l.annulee && "line-through")}>
                        {l.produit ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-white">
                        {l.v.quantity}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {l.options.map((o) => (
                            <span key={o.id} className={cx("chip", optionChip(o))}>
                              {o.nom}
                            </span>
                          ))}
                          {l.options.length === 0 && <span className="text-slate-600">—</span>}
                        </div>
                      </td>
                      <td
                        className={cx(
                          "px-4 py-2.5 text-right tabular-nums",
                          l.annulee ? "text-slate-500 line-through" : "text-amber-300",
                        )}
                      >
                        {formatMoney(l.commission)}
                      </td>
                      <td className="px-4 py-2.5">
                        <StatutBadge annulee={l.annulee} motif={l.v.motif_annulation} />
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {l.annulable && (
                          <AnnulerVenteButton
                            venteId={l.v.id}
                            resume={`${l.produit ?? l.v.acte_type} × ${l.v.quantity}`}
                          />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Mobile : cartes empilées */}
          <ul className="space-y-2 md:hidden">
            {lignes.map((l) => (
              <li key={l.v.id} className={cx("card p-4", l.annulee && "opacity-50")}>
                <div className="flex items-start justify-between gap-3">
                  <div className={cx("min-w-0", l.annulee && "line-through")}>
                    <ActeLabel acte={l.v.acte_type} />
                    <p className="mt-0.5 truncate text-sm text-slate-300">
                      {l.produit ?? "—"}
                      <span className="text-slate-500"> × {l.v.quantity}</span>
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p
                      className={cx(
                        "font-semibold tabular-nums",
                        l.annulee ? "text-slate-500 line-through" : "text-amber-300",
                      )}
                    >
                      {formatMoney(l.commission)}
                    </p>
                    <p className="text-xs text-slate-500">
                      {l.date} · {l.heure}
                    </p>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1">
                  {l.options.map((o) => (
                    <span key={o.id} className={cx("chip", optionChip(o))}>
                      {o.nom}
                    </span>
                  ))}
                  <span className="ml-auto flex items-center gap-2">
                    <StatutBadge annulee={l.annulee} motif={l.v.motif_annulation} />
                    {l.annulable && (
                      <AnnulerVenteButton
                        venteId={l.v.id}
                        resume={`${l.produit ?? l.v.acte_type} × ${l.v.quantity}`}
                      />
                    )}
                  </span>
                </div>
                {l.annulee && l.v.motif_annulation && (
                  <p className="mt-1.5 text-xs text-slate-500">Motif : {l.v.motif_annulation}</p>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="text-xs text-slate-500">
        « Commission » = montant du produit + bonus options, hors boosts
        mensuels (le détail complet est sur ton tableau de bord).
        {isAdmin
          ? " En tant qu'admin, tu peux annuler n'importe quelle vente."
          : " Tu peux annuler tes ventes du jour ; pour une vente plus ancienne, demande à un admin."}
      </p>
    </div>
  );
}

function StatutBadge({ annulee, motif }: { annulee: boolean; motif?: string | null }) {
  return annulee ? (
    <span className="chip bg-rose-500/15 text-rose-200" title={motif ?? undefined}>
      Annulée
    </span>
  ) : (
    <span className="chip bg-emerald-500/15 text-emerald-200">Validée</span>
  );
}

function FilterRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function FilterChip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      className={cx(
        "rounded-full border px-3 py-1.5 text-sm font-medium transition",
        active
          ? "border-brand bg-brand text-white"
          : "border-line bg-surface-strong text-slate-400 hover:text-white",
      )}
    >
      {children}
    </Link>
  );
}

function ActeLabel({ acte }: { acte: string }) {
  const cat = categoryForActe(acte);
  return (
    <span className={cx("text-sm font-semibold", cat?.accent ?? "text-white")}>{acte}</span>
  );
}
