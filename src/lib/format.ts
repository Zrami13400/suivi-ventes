export function formatMoney(value: number | null | undefined): string {
  const n = typeof value === "number" ? value : 0;
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(n);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(
    new Date(value),
  );
}

export function formatLongDate(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "full" }).format(d);
}

export function pct(
  realise: number | null | undefined,
  cible: number | null | undefined,
): number {
  const r = typeof realise === "number" ? realise : 0;
  const c = typeof cible === "number" ? cible : 0;
  if (c <= 0) return 0;
  return Math.min(100, Math.round((r / c) * 100));
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Premier prénom, tel qu'affiché dans le bandeau « Bonjour … ». */
export function firstName(nomComplet: string | null | undefined): string {
  return (nomComplet ?? "").trim().split(/\s+/)[0] || "collègue";
}

const MOTIVATIONS = [
  "Chaque acte compte — on lâche rien aujourd'hui.",
  "Un client à la fois, un objectif à la fois.",
  "La régularité bat le talent. Continue comme ça !",
  "Bonne énergie = bonnes ventes. C'est parti.",
  "Objectif du jour en ligne de mire 🎯",
];

/** Message motivant stable pour une date donnée (déterministe). */
export function motivation(dateISO: string = todayISO()): string {
  let h = 0;
  for (const ch of dateISO) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return MOTIVATIONS[h % MOTIVATIONS.length];
}

/** Étiquette « Septembre 2026 » pour un mois AAAA-MM. */
export function monthLabel(mois: string): string {
  const [y, m] = mois.split("-").map(Number);
  const d = new Date(y, (m || 1) - 1, 1);
  const s = new Intl.DateTimeFormat("fr-FR", {
    month: "long",
    year: "numeric",
  }).format(d);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Mois courant au format AAAA-MM. */
export function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

/** Bornes [lundi 00:00, lundi suivant] de la semaine contenant `ref`. */
export function weekRange(ref: Date = new Date()): { start: Date; end: Date } {
  const d = new Date(ref);
  d.setHours(0, 0, 0, 0);
  const day = (d.getDay() + 6) % 7; // lundi = 0
  const start = new Date(d);
  start.setDate(d.getDate() - day);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return { start, end };
}

/** Bornes ISO [début, finExclusive] d'un mois AAAA-MM. */
export function monthRange(mois: string): { start: string; end: string } {
  const [y, m] = mois.split("-").map(Number);
  const start = new Date(Date.UTC(y, (m || 1) - 1, 1));
  const end = new Date(Date.UTC(y, m || 1, 1));
  return { start: start.toISOString(), end: end.toISOString() };
}
