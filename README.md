# FreeKpi

Application Next.js 14 (App Router, TypeScript, Tailwind CSS) de suivi des
ventes, des objectifs, du planning, des primes à paliers et de la
gamification par boutique, connectée à Supabase. Thème sombre, navigation
latérale, cartes KPI et barres de progression par catégorie.

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
SUPABASE_SERVICE_ROLE_KEY=...
```

`SUPABASE_SERVICE_ROLE_KEY` (Dashboard → Project Settings → API, secret
"service_role") n'est utilisée que côté serveur (`/api/admin/create-seller`,
suppression de vendeur) pour l'API admin GoTrue et l'upload Storage. Elle ne
doit jamais être préfixée `NEXT_PUBLIC_` ni exposée au navigateur.

## Migrations Supabase (SQL Editor, dans l'ordre)

1. `schema.sql` — schéma initial (tables, trigger, vue `progression_objectifs`).
2. `migrations/001_commission_par_acte.sql` — commission par acte
   (`acte_type` + `quantity` + `has_mcafee` + `has_assurance`).
3. `migrations/002_challenges.sql` — table `challenges` (challenges entre
   vendeurs) + politique RLS de lecture collective des `ventes` au sein
   d'une même boutique.
4. `migrations/003_objectifs_planning_paliers.sql` — **nouveau** :
   - `objectifs` : cible par type d'acte (Freebox / Forfait mobile /
     Téléphone / Assurance / McAfee), en **volume** ou en **taux**
     d'attachement, au niveau boutique ou par conseiller.
   - `planning` : présence / absence par vendeur et par jour.
   - `sous_types_actes` : sous-produits par type d'acte avec un montant de
     base € (ex. Freebox Pop / Ultra), configurables dans `/admin/primes`.
   - `paliers_primes` : boost individuel (seuil mensuel + € / vente
     au-delà) et boost collectif (€ / vente, proratisé si la boutique
     dépasse son objectif mensuel du type d'acte).
   - `ventes.sous_type_id` : sous-produit vendu.
   - `primes_mensuelles` : prime du mois par vendeur, ventilée (base /
     boost individuel / boost collectif / bonus McAfee / bonus Assurance).
   - Trigger de recalcul réécrit (portée mensuelle pour les boosts, tout en
     conservant `primes_journalieres` pour les vues jour/semaine) et vue
     `progression_objectifs` réécrite (volume + taux + jours travaillés).

   Après l'exécution, relancez le calcul pour l'historique existant :

   ```sql
   select recalculer_primes_boutique(id) from shops;
   ```
5. `migrations/004_fix_recalculer_prime_jour.sql` — correctif :
   `recalculer_prime_jour()` (définie en 003) avait un `INSERT` à 5 colonnes
   mais une liste `SELECT` de 4 expressions (`now()` manquant), ce qui faisait
   échouer `recalculer_primes_boutique(...)` avec `INSERT has more target
   columns than expressions`. Recrée uniquement cette fonction (idempotent).
   Relancez ensuite `select recalculer_primes_boutique(id) from shops;`.
6. `migrations/005_avatars.sql` — **nouveau** : colonne `profiles.avatar_url`
   + bucket Storage `avatars` (public en lecture) + politiques RLS
   (écriture réservée aux admins de la boutique). Voir le fichier pour
   l'étape manuelle si l'`insert into storage.buckets` échoue par manque de
   droits (créer le bucket depuis le Dashboard). Nécessite aussi d'ajouter
   `SUPABASE_SERVICE_ROLE_KEY` dans `.env.local` (voir Configuration
   ci-dessus).
7. `migrations/006_modeles_telephones_options.sql` — **nouveau** :
   - `modeles_telephones` : catalogue de modèles de téléphones (marque + nom)
     configurable par l'admin (`/admin/modeles`), avec un montant de base €
     et une durée de validité optionnelle en mois. Prioritaire sur
     `sous_types_actes` pour le montant de base d'une vente Téléphone.
   - `ventes.modele_id` + `ventes.has_coque` / `has_reprise` / `has_garantie`
     — nouvelles options Téléphone, au même principe que McAfee / Assurance.
   - `regles_primes.bonus_coque` / `bonus_reprise` / `bonus_garantie` et les
     colonnes correspondantes sur `primes_mensuelles`.
   - `recalculer_prime_jour` / `recalculer_primes_mois` mis à jour pour tenir
     compte du modèle vendu et des 3 nouvelles options.

   Après l'exécution, relancez le calcul pour l'historique existant :

   ```sql
   select recalculer_primes_boutique(id) from shops;
   ```

> Chaque section (Challenges, Planning, primes à paliers) se dégrade
> proprement (bandeau d'avertissement) si sa migration n'a pas encore été
> exécutée sur le projet Supabase.

## Règles métier

- **Les primes sont toujours individuelles et privées.** Chaque vendeur ne
  voit que le montant de _ses_ primes (tableau de bord, « Mon profil »).
  L'admin voit toutes les primes (vue d'ensemble, colonne « Primes » du
  classement).
- **Les actes (ventes) et le planning sont visibles collectivement** par
  l'admin ; un vendeur ne voit que son propre planning et ses propres
  objectifs individuels (avec repli sur l'objectif boutique).
- **Commission à paliers**, portée par le trigger SQL `trg_vente_after_insert`
  sur `INSERT INTO ventes`, recalculée pour **tout le mois** (le boost
  collectif d'un vendeur dépend des ventes de toute la boutique) :

  ```
  Prime du mois = Σ (quantité × montant_base du sous-produit vendu)
                + Σ  max(0, ventes_mois(type) − seuil_individuel) × boost_individuel(type)
                + Σ  [si ventes_boutique(type) > objectif_mensuel(type)] ⌈ boost_collectif(type) × ventes_mois_vendeur(type) ⌉
                + (McAfee attaché) × quantité × bonus_mcafee
                + (Assurance attachée) × quantité × bonus_assurance
  ```

  Le même calcul est répliqué côté application
  (`src/lib/kpi.ts`, `computeCommission`) pour l'estimation en temps réel et
  le détail affiché au vendeur (`CommissionBreakdown`). `primes_journalieres`
  continue de porter une prime « de base » du jour (sans les boosts, qui sont
  mensuels) pour les vues jour/semaine.

## Pages

| Route | Contenu |
| --- | --- |
| `/login` | Connexion FreeKpi |
| `/dashboard` (Accueil) | **Desktop** : bandeau « Bonjour … », cartes KPI, défi du jour, saisie d'acte, actes du jour. **Mobile (< lg)** : application une-page avec barre de navigation basse à 5 onglets (Accueil / Stats / Équipe / Prime / Plus), voir « Shell mobile » ci-dessous |
| `/objectifs` | Par type d'acte : objectif individuel s'il existe, sinon repli boutique — barres volume et taux d'attachement |
| `/ventes` | Saisie d'un acte (avec sous-produit), objectifs du jour par catégorie, liste des actes du jour avec prime de base par ligne |
| `/planning` | Planning du mois du vendeur (lecture seule) + répartition des statuts |
| `/classement` | Classement d'équipe par actes + statut (🔥 ↑ → ↓), sélecteur de mois, couronne du top vendeur |
| `/challenges` | Challenges En cours / À venir / Terminés, palmarès |
| `/profil` | Niveau (1→5), série de jours, badges, détail de prime du mois (privé), 7 derniers jours |
| `/admin` | Vue d'ensemble : classement + primes de tous les vendeurs, objectif boutique |
| `/admin/vendeurs` | Création de comptes vendeurs (nom, email, mot de passe temporaire, avatar) ; liste des vendeurs de la boutique avec suppression |
| `/admin/objectifs` | Création d'objectifs (volume + taux) par type d'acte, boutique ou conseiller ; édition/suppression, jours travaillés |
| `/admin/primes` | Sous-produits (montant de base), paliers de boost individuel/collectif, bonus McAfee/Assurance |
| `/admin/planning` | Grille mensuelle par vendeur, clic pour cycler Présent/Absent/Congé/Maladie/Formation |
| `/admin/challenges` | Création / suppression de challenges |
| `/admin/modeles` | Catalogue des modèles de téléphones (marque, nom, montant de base, validité en mois) |

## Shell mobile (< lg)

Sous le breakpoint `lg`, `/dashboard` devient une application une-page avec
une barre de navigation fixe en bas (`src/components/mobile/BottomNav.tsx`) à
5 onglets : **Accueil**, **Stats**, **Équipe**, **Prime**, **Plus**. Le
changement d'onglet se fait par état React partagé
(`src/components/mobile/DashboardTabContext.tsx`, fourni par `(app)/layout.tsx`)
donc sans rechargement de page ; un lien `?tab=<onglet>` depuis une autre
route ouvre `/dashboard` directement sur l'onglet demandé. Le desktop (`lg+`)
n'est pas affecté : il garde la barre latérale et le tableau de bord existant
(`AccueilClient.tsx`). Les deux partagent la même logique temps réel via le
hook `src/lib/useLiveDashboard.ts`. Toutes les routes existantes
(`/ventes`, `/profil`, `/admin/*`, etc.) restent accessibles telles quelles,
via lien direct ou depuis l'onglet **Plus**.

## Gamification

- **Niveaux 1 → 5** selon le nombre d'actes du mois (`src/lib/constants.ts`,
  `NIVEAUX`).
- **Badges mensuels** dérivés des ventes : Top Box, Meilleur Cross-sell,
  Sérieux, Esprit d'équipe, Progression (`src/lib/kpi.ts`, `computeBadges`).
- **Série (streak)** : jours consécutifs avec au moins un acte.

## Temps réel

`primes_journalieres` et `primes_mensuelles` doivent rester répliquées en
Realtime (la migration 003 ajoute `primes_mensuelles` automatiquement) :

```sql
alter publication supabase_realtime add table primes_journalieres;
alter publication supabase_realtime add table primes_mensuelles;
```

Le tableau de bord d'un vendeur (`src/components/AccueilClient.tsx`) s'abonne
à `primes_mensuelles` **et** aux `INSERT` de `ventes` pour son propre
`vendeur_id`, et met à jour ses cartes KPI et le détail de sa prime du mois en
direct — y compris quand le boost collectif change suite à une vente d'un
autre vendeur (le trigger recalcule toute la boutique à chaque vente).

## Politiques RLS attendues

- `profiles` : chaque profil lit au moins sa boutique.
- `ventes` : **lecture autorisée sur toute la boutique** (`shop_id` du profil)
  — nécessaire pour le classement, les stats d'équipe et le calcul du boost
  collectif. Politique `ventes_select_boutique` (migration 002).
- `primes_journalieres` / `primes_mensuelles` : chaque vendeur lit
  **uniquement ses lignes** ; les admins lisent celles de leur boutique.
- `planning` : chaque vendeur lit uniquement ses lignes ; l'admin gère tout
  le planning de sa boutique (lecture + écriture).
- `sous_types_actes` / `paliers_primes` / `modeles_telephones` : lecture par
  tout membre de la boutique (nécessaire côté vendeur pour le formulaire de
  vente et l'estimation de prime), écriture réservée aux admins.
- `objectifs` / `regles_primes` / `challenges` : gestion réservée aux admins.

## Architecture

| Chemin | Rôle |
| --- | --- |
| `src/lib/kpi.ts` | Calculs dérivés (commission à paliers, catégories, classement, badges, niveaux, objectifs) |
| `src/lib/shop-month.ts` | Chargement + agrégation des données d'une boutique pour un mois (ventes, primes, barème, planning, objectifs) |
| `src/lib/planning.ts` | Jours travaillés, répartition des statuts de planning |
| `src/lib/challenges.ts` | Statut et classement d'un challenge |
| `src/lib/constants.ts` | Types d'actes, catégories (couleurs / sous-types), objectifs, planning, niveaux, badges |
| `src/components/Sidebar.tsx` | Navigation latérale (desktop) + barre inférieure (mobile) |
| `src/components/AccueilClient.tsx` | Cartes KPI + détail de prime du mois en temps réel |
| `src/components/CommissionBreakdown.tsx` | Ventilation base / boost individuel / boost collectif / bonus (toujours privée) |
| `src/components/PlanningGrid.tsx` | Grille admin cliquable (présence) |
| `src/components/BaremeForm.tsx` | Configuration sous-produits + paliers + bonus options |
| `src/components/ModeleForm.tsx` | Configuration du catalogue de modèles de téléphones (`/admin/modeles`) |
| `src/lib/useLiveDashboard.ts` | Souscription temps réel + calculs partagés entre `AccueilClient` (desktop) et l'onglet Accueil mobile |
| `src/components/mobile/` | Shell mobile une-page : contexte d'onglet, barre de navigation basse, 5 onglets |
| `src/app/(app)/` | Zone authentifiée |
