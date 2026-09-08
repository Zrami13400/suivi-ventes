# FreeKpi

Application Next.js 14 (App Router, TypeScript, Tailwind CSS) de suivi des
ventes, des objectifs, des primes et de la gamification par boutique, connectée
à Supabase. Thème sombre, navigation latérale, cartes KPI et barres de
progression par catégorie.

## Démarrage

```bash
npm install
npm run dev
```

L'application tourne sur http://localhost:3000.

## Configuration

Les identifiants Supabase sont dans `.env.local` :

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

## Migrations Supabase (SQL Editor, dans l'ordre)

1. `schema.sql` — schéma initial (tables, trigger, vue `progression_objectifs`).
2. `migrations/001_commission_par_acte.sql` — commission par acte
   (`acte_type` + `quantity` + `has_mcafee` + `has_assurance`).
3. `migrations/002_challenges.sql` — **nouveau** : table `challenges`
   (challenges entre vendeurs) + politique RLS de lecture collective des
   `ventes` au sein d'une même boutique.

> La section « Challenges » et le classement d'équipe se dégradent proprement
> si la migration 002 n'est pas exécutée, mais l'affichage sera incomplet.

## Règles métier

- **Les primes sont individuelles et privées.** Chaque vendeur ne voit que le
  montant de _ses_ primes (tableau de bord, « Mon profil »). L'admin voit toutes
  les primes (vue d'ensemble, colonne « Primes » du classement).
- **Les actes (ventes) sont collectifs.** Ils alimentent le classement, les
  statistiques d'équipe et les challenges, visibles par tous.
- Le calcul de prime reste porté par le trigger SQL `recalculer_prime()` sur
  `INSERT INTO ventes` :

  ```
  Σ (quantité × montant_par_acte)
  + Σ (McAfee coché)    × quantité × bonus_mcafee
  + Σ (Assurance cochée) × quantité × bonus_assurance
  ```

  Le même calcul est répliqué côté application (`src/lib/kpi.ts`,
  `ligneCommission` / `primeParts`) pour les estimations en temps réel et la
  ventilation Box / Forfaits / Téléphones / McAfee.

## Pages

| Route | Contenu |
| --- | --- |
| `/login` | Connexion FreeKpi |
| `/dashboard` (Accueil) | Bandeau « Bonjour … », 4 cartes KPI, ventes du jour par catégorie, primes du jour (privé), panneau profil |
| `/objectifs` | Onglets **Boutique** (objectif du mois, répartition par catégorie, taux McAfee) / **Conseiller** (objectif individuel, jours travaillés) |
| `/ventes` | Saisie d'un acte, objectifs du jour par catégorie, liste des actes du jour avec prime par ligne |
| `/classement` | Classement d'équipe par actes + statut (🔥 ↑ → ↓), sélecteur de mois, couronne du top vendeur |
| `/challenges` | Challenges En cours / À venir / Terminés, palmarès |
| `/profil` | Niveau (1→5), série de jours, badges, primes du mois (privé), 7 derniers jours |
| `/admin` | Vue d'ensemble : classement + primes de tous les vendeurs, objectif boutique |
| `/admin/objectifs` | Création / suppression d'objectifs (en nombre d'actes) |
| `/admin/primes` | Barème de commission par type d'acte |
| `/admin/challenges` | Création / suppression de challenges |

## Gamification

- **Niveaux 1 → 5** selon le nombre d'actes du mois (`src/lib/constants.ts`,
  `NIVEAUX`).
- **Badges mensuels** dérivés des ventes : Top Box, Meilleur Cross-sell,
  Sérieux, Esprit d'équipe, Progression (`src/lib/kpi.ts`, `computeBadges`).
- **Série (streak)** : jours consécutifs avec au moins un acte.

## Temps réel

`primes_journalieres` doit rester répliquée en Realtime :

```sql
alter publication supabase_realtime add table primes_journalieres;
```

Le tableau de bord d'un vendeur (`src/components/AccueilClient.tsx`) s'abonne à
`primes_journalieres` **et** aux `INSERT` de `ventes` pour son propre
`vendeur_id`, et met à jour ses cartes KPI et sa prime estimée en direct.

## Politiques RLS attendues

- `profiles` : chaque profil lit au moins sa boutique.
- `ventes` : **lecture autorisée sur toute la boutique** (`shop_id` du profil) —
  nécessaire pour le classement et les stats d'équipe. La politique
  `ventes_select_boutique` est créée par `migrations/002_challenges.sql`.
- `primes_journalieres` : chaque vendeur lit **uniquement ses lignes** ; les
  admins lisent celles de leur boutique.
- `objectifs` / `regles_primes` / `challenges` : gestion réservée aux admins.

## Architecture

| Chemin | Rôle |
| --- | --- |
| `src/lib/kpi.ts` | Calculs dérivés (commission, catégories, classement, badges, niveaux) |
| `src/lib/shop-month.ts` | Chargement + agrégation des données d'une boutique pour un mois |
| `src/lib/challenges.ts` | Statut et classement d'un challenge |
| `src/lib/constants.ts` | Types d'actes, catégories (couleurs / sous-types), niveaux, badges |
| `src/components/Sidebar.tsx` | Navigation latérale (desktop) + barre inférieure (mobile) |
| `src/components/AccueilClient.tsx` | Cartes KPI + primes en temps réel |
| `src/app/(app)/` | Zone authentifiée |
