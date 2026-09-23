"use client";

import {
  ArrowRight,
  Box,
  CalendarDays,
  ChartColumn,
  ChevronRight,
  Coins,
  Crown,
  Flame,
  Rocket,
  Smartphone,
  Target,
  TabletSmartphone,
  Trophy,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { firstName, formatMoney, motivation, pct } from "@/lib/format";
import { computeCommission, mostFrequentActeType, objectifVolumeJour } from "@/lib/kpi";
import { CATEGORIES, type ActeType } from "@/lib/constants";
import { useLiveDashboard, type LiveDashboardProps } from "@/lib/useLiveDashboard";
import { ActeEntrySheet } from "../ActeEntrySheet";
import { AdminQuickAccess } from "../AdminQuickAccess";
import { ActeIcon } from "../ActeIcon";
import { Avatar, cx } from "../ui";
import { AnimatedMoney } from "../ui-client";

export interface AccueilDashboardProps extends LiveDashboardProps {
  nomComplet: string;
  avatarUrl: string | null;
  role: string;
  shopNom: string | null;
  presenceStreakDays: number;
  presenceRecord: number;
  rang: number | null;
  totalSellers: number;
  /** Incrémenté par un FAB externe pour ouvrir la saisie rapide. */
  fabBump?: number;
  /** Prime totale à jour (badge de l'onglet Prime mobile). */
  onPrimeTotal?: (total: number) => void;
}

// Couleurs par type d'acte : rouge/rose Freebox, bleu Forfaits, vert Téléphones.
const ACTE_UI: Record<
  ActeType,
  { pill: string; bar: string; button: string; buttonLabel: string; icon: ReactNode }
> = {
  Freebox: {
    pill: "bg-rose-500/20 text-rose-300",
    bar: "bg-rose-400",
    button: "grad-action-freebox",
    buttonLabel: "Freebox",
    icon: <Box className="h-7 w-7" strokeWidth={2} aria-hidden />,
  },
  "Forfait mobile": {
    pill: "bg-blue-500/20 text-blue-300",
    bar: "bg-blue-400",
    button: "grad-action-forfait",
    buttonLabel: "Forfait",
    icon: <TabletSmartphone className="h-7 w-7" strokeWidth={2} aria-hidden />,
  },
  Téléphone: {
    pill: "bg-emerald-500/20 text-emerald-300",
    bar: "bg-emerald-400",
    button: "grad-action-telephone",
    buttonLabel: "Téléphone",
    icon: <Smartphone className="h-7 w-7" strokeWidth={2} aria-hidden />,
  },
};

function ordinal(n: number): string {
  return n === 1 ? "er" : "ème";
}

function Bar({ value, className }: { value: number; className: string }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/10">
      <div
        className={cx("h-full rounded-full transition-all duration-500", className)}
        style={{ width: `${v}%` }}
      />
    </div>
  );
}

function CardTitle({
  icon,
  children,
  action,
}: {
  icon: ReactNode;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-white">
        {icon}
        {children}
      </h2>
      {action}
    </div>
  );
}

function Tile({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col items-center justify-center gap-1 rounded-2xl border border-line bg-surface-soft px-2 py-4 text-center">
      {children}
    </div>
  );
}

export function AccueilDashboard(props: AccueilDashboardProps) {
  const {
    vendeurId,
    nomComplet,
    avatarUrl,
    role,
    shopNom,
    presenceStreakDays,
    presenceRecord,
    rang,
    totalSellers,
    today,
    objectifs,
    paliers,
    objectifsBoutiqueMois,
    sellerDailyTarget,
    teammates,
    fabBump,
    onPrimeTotal,
  } = props;

  const [sheetActe, setSheetActe] = useState<ActeType | null>(null);
  const {
    toasts,
    setToasts,
    pb,
    sellerVentes,
    shopVentes,
    computed,
    breakdownTotal,
    ownActesToday,
    parCatToday,
    objCat,
  } = useLiveDashboard(props);

  useEffect(() => {
    onPrimeTotal?.(breakdownTotal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [breakdownTotal]);

  const fabBumpRef = useRef(0);
  useEffect(() => {
    if (fabBump && fabBump !== fabBumpRef.current) {
      fabBumpRef.current = fabBump;
      setSheetActe(mostFrequentActeType(sellerVentes));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fabBump]);

  function pushToast(text: string) {
    setToasts((p) => [...p, { id: `${Date.now()}-${Math.random()}`, text }]);
  }

  // --- Prime : gain depuis ce matin (prime du mois hors ventes du jour) ----
  const primeMatin = useMemo(() => {
    const notToday = (v: { created_at: string }) => v.created_at.slice(0, 10) !== today;
    return computeCommission(sellerVentes.filter(notToday), shopVentes.filter(notToday), {
      priceBook: pb,
      paliers,
      objectifsBoutiqueMois,
    }).total;
  }, [sellerVentes, shopVentes, today, pb, paliers, objectifsBoutiqueMois]);
  const deltaJour = Math.max(0, Math.round((computed.total - primeMatin) * 100) / 100);

  // --- Objectif du jour -----------------------------------------------------
  const objectifJour = sellerDailyTarget;
  const pctJour = pct(ownActesToday, objectifJour);

  // --- Prochain palier (barème individuel, cumul du mois) ------------------
  const palier = useMemo(() => {
    const configured = paliers.filter(
      (p) => Number(p.seuil_individuel) > 0 && Number(p.boost_individuel) > 0,
    );
    const candidates = configured
      .map((p) => {
        const qte = sellerVentes.reduce(
          (s, v) => (v.acte_type === p.acte_type ? s + v.quantity : s),
          0,
        );
        const seuil = Number(p.seuil_individuel);
        return {
          acte: p.acte_type,
          label: CATEGORIES.find((c) => c.acte === p.acte_type)?.label ?? p.acte_type,
          qte,
          seuil,
          restant: Math.max(0, Math.ceil(seuil - qte)),
          gain: Number(p.boost_individuel),
        };
      })
      .filter((c) => c.restant > 0)
      .sort((a, b) => a.restant - b.restant || b.gain - a.gain);
    return {
      next: candidates[0] ?? null,
      allReached: configured.length > 0 && candidates.length === 0,
    };
  }, [paliers, sellerVentes]);

  // --- Challenge du jour : type d'acte au plus gros objectif du jour -------
  const challenge = useMemo(() => {
    let best: { acte: ActeType; label: string; cible: number } | null = null;
    for (const c of CATEGORIES) {
      const cible =
        objCat[c.key] ||
        Math.round(objectifVolumeJour(objectifs, c.acte, today));
      if (cible > 0 && (!best || cible > best.cible)) {
        best = { acte: c.acte, label: c.label, cible };
      }
    }
    const counts = new Map<string, number>();
    for (const v of shopVentes) {
      if (v.created_at.slice(0, 10) !== today) continue;
      if (best && v.acte_type !== best.acte) continue;
      counts.set(v.vendeur_id, (counts.get(v.vendeur_id) ?? 0) + v.quantity);
    }
    const rows = teammates
      .map((t) => ({ ...t, actes: counts.get(t.id) ?? 0 }))
      .sort((a, b) => b.actes - a.actes || a.nom_complet.localeCompare(b.nom_complet));
    const scale = Math.max(best?.cible ?? 0, rows[0]?.actes ?? 0, 1);
    return { best, rows, scale };
  }, [objCat, objectifs, today, shopVentes, teammates]);

  const classementLabel = rang ? (
    <>
      {rang}
      <sup className="text-base">{ordinal(rang)}</sup>
      <span className="text-lg font-bold text-slate-400"> / {totalSellers}</span>
    </>
  ) : (
    "—"
  );

  return (
    <div className="space-y-5 pb-4 lg:space-y-6">
      {/* Toasts (achievements équipe + confirmations de vente) */}
      <div className="pointer-events-none fixed inset-x-4 top-4 z-50 flex flex-col items-center gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto max-w-xs rounded-lg border border-brand/30 bg-surface-strong/95 px-4 py-3 text-sm text-white shadow-glow backdrop-blur"
          >
            {t.text}
          </div>
        ))}
      </div>

      {/* BLOC 1 — Bandeau identité */}
      <section className="card p-4 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-4">
              <Link href="/profil" aria-label="Mon profil" className="shrink-0">
                <Avatar
                  name={nomComplet}
                  avatarUrl={avatarUrl}
                  size={100}
                  className="ring-2 ring-amber-300/80 ring-offset-2 ring-offset-surface"
                />
              </Link>
              <div className="min-w-0">
                <h1 className="text-2xl font-black leading-tight text-white sm:text-4xl">
                  Bonjour {firstName(nomComplet)} <span aria-hidden>👋</span>
                </h1>
                <p className="mt-1.5 text-sm italic text-slate-300 sm:text-base">
                  {motivation(today)}
                </p>
                <p className="mt-1 truncate text-sm text-slate-400">
                  {role === "admin" ? "Admin" : "Vendeur"}
                  {shopNom ? ` • Boutique ${shopNom}` : ""}
                </p>
              </div>
            </div>

            <div className="mt-5">
              <p className="flex items-center gap-2 text-sm font-semibold text-white sm:text-base">
                <Target className="h-5 w-5 text-rose-400" strokeWidth={2.2} aria-hidden />
                Objectif du jour :{" "}
                <span className="text-rose-300">
                  {objectifJour > 0 ? `${objectifJour} actes` : "non défini"}
                </span>
              </p>
              <div className="mt-2.5 h-4 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-300 transition-all duration-500"
                  style={{ width: `${pctJour}%` }}
                />
              </div>
              <div className="mt-1.5 flex items-center justify-between text-sm">
                <span className="font-semibold tabular-nums text-white">
                  {ownActesToday} / {objectifJour || "—"}
                </span>
                <span className="font-bold tabular-nums text-emerald-300">{pctJour}%</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 sm:gap-3 lg:w-[30rem] lg:shrink-0">
            <Tile>
              <Coins className="h-6 w-6 text-amber-300" strokeWidth={2} aria-hidden />
              <p className="text-[11px] font-medium text-slate-400">Ta prime du jour</p>
              <AnimatedMoney
                value={breakdownTotal}
                className="text-2xl font-black leading-none tabular-nums text-amber-300 sm:text-4xl"
              />
              <p
                className={cx(
                  "text-[11px] font-semibold",
                  deltaJour > 0 ? "text-emerald-400" : "text-slate-500",
                )}
              >
                +{formatMoney(deltaJour)} depuis ce matin
              </p>
            </Tile>
            <Tile>
              <Trophy className="h-6 w-6 text-amber-300" strokeWidth={2} aria-hidden />
              <p className="text-[11px] font-medium text-slate-400">Classement équipe</p>
              <p className="text-2xl font-black leading-none tabular-nums text-white sm:text-4xl">
                {classementLabel}
              </p>
              {rang === 1 && (
                <Crown
                  className="h-5 w-5 fill-amber-300/30 text-amber-300"
                  strokeWidth={2}
                  aria-label="Premier de l'équipe"
                />
              )}
            </Tile>
            <Tile>
              <Flame className="h-6 w-6 fill-orange-500/30 text-orange-400" strokeWidth={2} aria-hidden />
              <p className="text-[11px] font-medium text-slate-400">Série en cours</p>
              <p className="text-2xl font-black leading-none tabular-nums text-white sm:text-4xl">
                {presenceStreakDays}
                <span className="text-sm font-bold text-slate-400">
                  {" "}
                  jour{presenceStreakDays > 1 ? "s" : ""}
                </span>
              </p>
              <p className="flex items-center gap-1 text-[11px] text-slate-400">
                <CalendarDays className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                Record : {Math.max(presenceRecord, presenceStreakDays)} jours
              </p>
            </Tile>
          </div>
        </div>
      </section>

      {role === "admin" && <AdminQuickAccess />}

      {/* BLOC 2 — Course du jour / Prochain palier / Challenge */}
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card p-5">
          <CardTitle icon={<Target className="h-4 w-4 text-rose-400" strokeWidth={2.2} aria-hidden />}>
            Ma course du jour
          </CardTitle>
          <ul className="mt-4 space-y-4">
            {CATEGORIES.map((c) => {
              const ui = ACTE_UI[c.acte];
              const realise = parCatToday[c.key];
              const cible = objCat[c.key];
              return (
                <li key={c.key} className="flex items-center gap-3">
                  <span className={cx("grid h-10 w-10 shrink-0 place-items-center rounded-xl", ui.pill)}>
                    <ActeIcon acte={c.acte} className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-bold text-white">{c.label}</span>
                      <span className="text-xs tabular-nums text-slate-400">
                        {realise} / {cible || "—"}
                      </span>
                    </div>
                    <div className="mt-1.5">
                      <Bar value={pct(realise, cible)} className={ui.bar} />
                    </div>
                  </div>
                  <span className="w-11 shrink-0 text-right text-sm font-bold tabular-nums text-white">
                    {pct(realise, cible)}%
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="card p-5">
          <CardTitle icon={<Rocket className="h-4 w-4 text-amber-300" strokeWidth={2.2} aria-hidden />}>
            Prochain palier
          </CardTitle>
          {palier.next ? (
            <>
              <p className="mt-4 text-sm text-slate-300">
                Encore{" "}
                <span className="font-bold text-white">
                  {palier.next.restant} acte{palier.next.restant > 1 ? "s" : ""}{" "}
                  {palier.next.label}
                </span>{" "}
                pour débloquer
              </p>
              <p className="mt-1 flex items-center gap-2">
                <Coins className="h-8 w-8 text-amber-300" strokeWidth={2} aria-hidden />
                <span className="text-4xl font-black tabular-nums text-amber-300">
                  +{formatMoney(palier.next.gain)}
                </span>
                <span className="text-xs text-slate-400">/ acte en plus</span>
              </p>
              <div className="mt-4">
                <Bar
                  value={pct(palier.next.qte, palier.next.seuil)}
                  className="bg-gradient-to-r from-amber-500 to-yellow-300"
                />
                <p className="mt-1 text-right text-xs tabular-nums text-slate-400">
                  {palier.next.qte} / {palier.next.seuil} ce mois-ci
                </p>
              </div>
              <p className="mt-3 text-sm font-medium text-amber-200">
                {palier.next.restant <= 2
                  ? "Tu y es presque, ne lâche rien ! 🚀"
                  : "Chaque acte te rapproche du bonus 💪"}
              </p>
            </>
          ) : palier.allReached ? (
            <>
              <p className="mt-4 text-sm text-slate-300">Tous tes paliers sont débloqués !</p>
              <p className="mt-1 flex items-center gap-2">
                <Coins className="h-8 w-8 text-amber-300" strokeWidth={2} aria-hidden />
                <span className="text-4xl font-black tabular-nums text-amber-300">
                  +{formatMoney(computed.boostIndividuel)}
                </span>
              </p>
              <p className="mt-1 text-xs text-slate-400">de boost gagné ce mois-ci</p>
              <p className="mt-3 text-sm font-medium text-amber-200">
                Chaque acte en plus rapporte encore plus 🎉
              </p>
            </>
          ) : (
            <p className="mt-4 text-sm text-slate-400">
              Aucun palier de prime configuré pour le moment.
            </p>
          )}
        </section>

        <section className="card p-5">
          <CardTitle
            icon={<Trophy className="h-4 w-4 text-amber-300" strokeWidth={2.2} aria-hidden />}
            action={
              <Link
                href="/classement"
                className="flex items-center text-xs font-medium text-brand-soft hover:text-white"
              >
                Voir tout <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              </Link>
            }
          >
            Challenge du jour
          </CardTitle>
          <p className="mt-1 text-xs text-slate-400">
            {challenge.best
              ? `Objectif : ${challenge.best.cible} ${challenge.best.label}`
              : "Objectif : tous les actes"}
          </p>
          {challenge.rows.length === 0 ? (
            <p className="mt-4 text-sm text-slate-400">Aucun vendeur dans la boutique.</p>
          ) : (
            <ol className="mt-3 space-y-1.5">
              {challenge.rows.map((r, i) => {
                const me = r.id === vendeurId;
                return (
                  <li
                    key={r.id}
                    className={cx(
                      "flex items-center gap-2.5 rounded-xl px-2 py-1.5",
                      me && "bg-brand/15 ring-1 ring-brand/40",
                    )}
                  >
                    <span className="w-4 shrink-0 text-center text-xs font-bold tabular-nums text-slate-400">
                      {i + 1}
                    </span>
                    <Avatar name={r.nom_complet} avatarUrl={r.avatar_url} size={28} />
                    <span
                      className={cx(
                        "w-20 shrink-0 truncate text-sm",
                        me ? "font-bold text-white" : "text-slate-200",
                      )}
                    >
                      {me ? "Toi" : firstName(r.nom_complet)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <Bar value={(r.actes / challenge.scale) * 100} className="bg-sky-400" />
                    </div>
                    <span className="w-6 shrink-0 text-right text-sm font-bold tabular-nums text-white">
                      {r.actes}
                    </span>
                    <span className="w-4 shrink-0">
                      {i < 3 && r.actes > 0 && (
                        <Flame
                          className="h-4 w-4 fill-orange-500/40 text-orange-400"
                          strokeWidth={2}
                          aria-label="En feu"
                        />
                      )}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>

      {/* BLOC 3 — Ajouter une vente */}
      <section className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-black uppercase tracking-wide text-white">
              <Zap className="h-5 w-5 fill-yellow-300 text-yellow-300" strokeWidth={2} aria-hidden />
              Ajouter une vente
            </h2>
            <p className="mt-0.5 text-sm text-slate-400">
              Enregistre rapidement un acte et fais avancer tes objectifs !
            </p>
          </div>
          <p
            className="-rotate-3 text-xl italic text-amber-300"
            style={{ fontFamily: '"Segoe Script", "Bradley Hand", "Brush Script MT", cursive' }}
          >
            Chaque acte compte !
          </p>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {CATEGORIES.map((c) => {
            const ui = ACTE_UI[c.acte];
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => setSheetActe(c.acte)}
                className={cx(
                  "flex min-h-[96px] w-full items-center gap-4 rounded-2xl px-5 text-left text-white shadow-card transition hover:brightness-110 active:scale-[0.98]",
                  ui.button,
                )}
              >
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white/20">
                  {ui.icon}
                </span>
                <span className="min-w-0 flex-1 text-xl font-black uppercase tracking-wide">
                  {ui.buttonLabel}
                </span>
                <ArrowRight className="h-6 w-6 shrink-0" strokeWidth={2.4} aria-hidden />
              </button>
            );
          })}
        </div>
      </section>

      {sheetActe && (
        <ActeEntrySheet
          open
          onClose={() => setSheetActe(null)}
          acteType={sheetActe}
          label={CATEGORIES.find((c) => c.acte === sheetActe)?.label ?? sheetActe}
          sousTypes={props.sousTypes}
          modeles={props.modeles}
          pb={pb}
          sellerVentesMois={sellerVentes}
          onSuccess={pushToast}
        />
      )}

      {/* BLOC 4 — Pied de page */}
      <p className="flex items-center justify-center gap-2 text-center text-xs text-slate-500">
        <ChartColumn className="h-4 w-4" strokeWidth={2} aria-hidden />
        Plus de ventes = Plus de primes = Plus de réussite !
      </p>
    </div>
  );
}
