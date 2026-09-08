import { formatDate, formatMoney } from "@/lib/format";
import {
  STATUT_META,
  challengeStandings,
  challengeStatut,
  type Standing,
} from "@/lib/challenges";
import type { Challenge, Profile, Vente } from "@/lib/types";
import { Avatar, ProgressBar, cx } from "./ui";

export function ChallengeCard({
  challenge,
  ventes,
  sellersById,
}: {
  challenge: Challenge;
  ventes: Vente[];
  sellersById: Map<string, Profile>;
}) {
  const statut = challengeStatut(challenge);
  const meta = STATUT_META[statut];
  const standings = challengeStandings(challenge, ventes, sellersById);
  const leader = standings[0];
  const maxScore = Math.max(1, ...standings.map((s) => s.score));

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-white">{challenge.titre}</p>
          <p className="text-xs text-slate-400">
            {formatDate(challenge.date_debut)} → {formatDate(challenge.date_fin)}
            {" · "}
            {challenge.metrique === "actes"
              ? "Tous actes"
              : challenge.metrique}
          </p>
        </div>
        <span className={cx("chip", meta.className)}>{meta.label}</span>
      </div>

      {challenge.description && (
        <p className="mt-2 text-sm text-slate-300">{challenge.description}</p>
      )}

      <div className="mt-4 space-y-3">
        {standings.map((s: Standing, i) => (
          <div key={s.vendeurId}>
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-white">
                <Avatar name={s.vendeur?.nom_complet ?? "?"} size={24} />
                {s.vendeur?.nom_complet ?? "Vendeur"}
                {statut === "termine" && i === 0 && s.score > 0 && (
                  <span aria-hidden>🏆</span>
                )}
              </span>
              <span className="font-semibold tabular-nums text-white">
                {s.score}
              </span>
            </div>
            <div className="mt-1">
              <ProgressBar
                value={(s.score / maxScore) * 100}
                tone={i === 0 ? "amber" : "brand"}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-sm">
        <span className="text-slate-400">Prime bonus au gagnant</span>
        <span className="font-semibold text-amber-300">
          {formatMoney(challenge.prime_bonus)}
        </span>
      </div>
      {statut !== "a_venir" && leader && leader.score > 0 && (
        <p className="mt-1 text-xs text-slate-500">
          {statut === "termine" ? "Vainqueur : " : "En tête : "}
          <span className="text-slate-300">
            {leader.vendeur?.nom_complet ?? "—"}
          </span>
        </p>
      )}
    </div>
  );
}
