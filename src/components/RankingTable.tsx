import { formatMoney } from "@/lib/format";
import { TREND_META, type RankRow } from "@/lib/kpi";
import { Avatar, cx } from "./ui";

export function RankingTable({
  rows,
  canSeePrimes,
  selfId,
}: {
  rows: RankRow[];
  canSeePrimes: boolean;
  selfId: string;
}) {
  return (
    <div className="card scrollbar-thin overflow-x-auto p-0">
      <table className="w-full text-sm">
        <thead className="border-b border-line text-left text-xs uppercase text-slate-500">
          <tr>
            <th className="px-4 py-3 font-medium">#</th>
            <th className="px-4 py-3 font-medium">Vendeur</th>
            <th className="px-4 py-3 text-right font-medium">Actes</th>
            <th className="px-4 py-3 text-center font-medium">Box</th>
            <th className="px-4 py-3 text-center font-medium">Forf.</th>
            <th className="px-4 py-3 text-center font-medium">Tél.</th>
            {canSeePrimes && (
              <th className="px-4 py-3 text-right font-medium">Primes</th>
            )}
            <th className="px-4 py-3 text-center font-medium">Statut</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line/60">
          {rows.map((r) => {
            const t = TREND_META[r.statut];
            const isSelf = r.vendeur.id === selfId;
            return (
              <tr
                key={r.vendeur.id}
                className={isSelf ? "bg-brand/5" : undefined}
              >
                <td className="px-4 py-3 tabular-nums text-slate-400">
                  {r.rang === 1 ? "👑" : r.rang}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <Avatar name={r.vendeur.nom_complet} size={28} />
                    <span className="font-medium text-white">
                      {r.vendeur.nom_complet}
                      {isSelf && (
                        <span className="ml-2 text-xs text-brand-soft">(moi)</span>
                      )}
                    </span>
                    <span className="chip bg-surface-strong text-slate-400">
                      Niv. {r.niveau}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums text-white">
                  {r.actes}
                </td>
                <td className="px-4 py-3 text-center tabular-nums text-slate-300">
                  {r.parCategorie.freebox}
                </td>
                <td className="px-4 py-3 text-center tabular-nums text-slate-300">
                  {r.parCategorie.forfaits}
                </td>
                <td className="px-4 py-3 text-center tabular-nums text-slate-300">
                  {r.parCategorie.telephones}
                </td>
                {canSeePrimes && (
                  <td className="px-4 py-3 text-right tabular-nums text-amber-300">
                    {formatMoney(r.prime)}
                  </td>
                )}
                <td className={cx("px-4 py-3 text-center", t.className)}>
                  <span title={t.label}>{t.emoji}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
