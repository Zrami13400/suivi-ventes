-- ============================================================
-- Migration 003 — Objectifs (volume + taux), Planning, Primes à paliers
-- ============================================================
-- À exécuter une fois dans le SQL Editor de Supabase, APRÈS
-- 001_commission_par_acte.sql et 002_challenges.sql.
--
-- Résumé :
--  1. objectifs      : cible par type d'acte (Freebox / Forfait mobile /
--                      Téléphone / Assurance / McAfee), en volume OU en taux
--                      d'attachement, au niveau boutique ou par conseiller.
--  2. planning        : présence / absence par vendeur et par jour.
--  3. sous_types_actes: sous-produits par type d'acte, avec montant de base €.
--  4. paliers_primes  : boost individuel (seuil mensuel + € / vente au-delà)
--                       et boost collectif (€ / vente proratisé si la boutique
--                       dépasse son objectif mensuel du type d'acte).
--  5. ventes.sous_type_id : le sous-produit vendu.
--  6. primes_mensuelles : prime du mois par vendeur, ventilée
--                         (base / boost individuel / boost collectif / bonus).
--  7. Trigger de recalcul réécrit (mensuel), vue progression_objectifs
--     réécrite (volume + taux + jours travaillés).
--
-- Les primes restent strictement individuelles (RLS). Le planning et les
-- objectifs sont visibles par l'admin ; un vendeur ne voit que les siens.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 0. Pré-requis
-- ------------------------------------------------------------
create extension if not exists pgcrypto;

drop view if exists progression_objectifs;

-- ============================================================
-- 1. OBJECTIFS — cible par type d'acte, volume ou taux
-- ============================================================
alter table objectifs
  add column if not exists acte_type   text,
  add column if not exists type_cible  text not null default 'volume',
  add column if not exists valeur_cible numeric(10,2);

-- Reprise : les anciens objectifs deviennent des objectifs "volume" globaux.
update objectifs
  set valeur_cible = nb_ventes_cible
  where valeur_cible is null;

alter table objectifs alter column nb_ventes_cible drop not null;

alter table objectifs drop constraint if exists objectifs_type_cible_chk;
alter table objectifs
  add constraint objectifs_type_cible_chk check (type_cible in ('volume', 'taux'));

alter table objectifs drop constraint if exists objectifs_acte_type_chk;
alter table objectifs
  add constraint objectifs_acte_type_chk
  check (acte_type is null
         or acte_type in ('Freebox', 'Forfait mobile', 'Téléphone', 'Assurance', 'McAfee'));

-- Un objectif "taux" ne concerne que McAfee (vs Freebox) ou Assurance (vs Téléphone).
alter table objectifs drop constraint if exists objectifs_taux_acte_chk;
alter table objectifs
  add constraint objectifs_taux_acte_chk
  check (type_cible <> 'taux' or acte_type in ('Assurance', 'McAfee'));

-- ============================================================
-- 2. PLANNING — présence / absence
-- ============================================================
create table if not exists planning (
  id         uuid primary key default gen_random_uuid(),
  vendeur_id uuid not null references profiles (id) on delete cascade,
  shop_id    uuid not null references shops (id) on delete cascade,
  date       date not null,
  statut     text not null default 'present'
               check (statut in ('present', 'absent', 'conge', 'maladie', 'formation')),
  created_at timestamptz not null default now(),
  unique (vendeur_id, date)
);

create index if not exists planning_shop_date_idx on planning (shop_id, date);

alter table planning enable row level security;

drop policy if exists planning_select_own on planning;
create policy planning_select_own on planning
  for select using (vendeur_id = auth.uid());

drop policy if exists planning_admin_all on planning;
create policy planning_admin_all on planning
  for all using (
    exists (select 1 from profiles p
            where p.id = auth.uid() and p.role = 'admin' and p.shop_id = planning.shop_id)
  ) with check (
    exists (select 1 from profiles p
            where p.id = auth.uid() and p.role = 'admin' and p.shop_id = planning.shop_id)
  );

-- ============================================================
-- 3. SOUS-TYPES D'ACTES — sous-produits avec montant de base
-- ============================================================
create table if not exists sous_types_actes (
  id           uuid primary key default gen_random_uuid(),
  shop_id      uuid not null references shops (id) on delete cascade,
  acte_type    text not null check (acte_type in ('Freebox', 'Forfait mobile', 'Téléphone')),
  nom          text not null,
  montant_base numeric(10,2) not null default 0,
  ordre        int not null default 0,
  unique (shop_id, acte_type, nom)
);

create index if not exists sous_types_shop_idx on sous_types_actes (shop_id, acte_type);

alter table sous_types_actes enable row level security;

drop policy if exists sous_types_select on sous_types_actes;
create policy sous_types_select on sous_types_actes
  for select using (
    shop_id in (select shop_id from profiles where id = auth.uid())
  );

drop policy if exists sous_types_admin_write on sous_types_actes;
create policy sous_types_admin_write on sous_types_actes
  for all using (
    exists (select 1 from profiles p
            where p.id = auth.uid() and p.role = 'admin' and p.shop_id = sous_types_actes.shop_id)
  ) with check (
    exists (select 1 from profiles p
            where p.id = auth.uid() and p.role = 'admin' and p.shop_id = sous_types_actes.shop_id)
  );

-- Jeu de sous-types par défaut (montant à 0 ; l'admin ajuste le barème).
insert into sous_types_actes (shop_id, acte_type, nom, montant_base, ordre)
select s.id, d.acte_type, d.nom, 0, d.ordre
from shops s
cross join (values
  ('Freebox',        'Pop',                          1),
  ('Freebox',        'Pop S / Révolution / Box 5G',  2),
  ('Freebox',        'Ultra / Ultra Essentiel',      3),
  ('Forfait mobile', 'Forfait 2h / 5 Go',            1),
  ('Forfait mobile', 'Série Free',                   2),
  ('Forfait mobile', 'Forfait Free 5G',              3),
  ('Téléphone',      'Reconditionné',                1),
  ('Téléphone',      'Standard',                     2),
  ('Téléphone',      'Premium',                      3)
) as d(acte_type, nom, ordre)
on conflict (shop_id, acte_type, nom) do nothing;

-- ============================================================
-- 4. PALIERS DE PRIMES — boost individuel + boost collectif
-- ============================================================
create table if not exists paliers_primes (
  id                uuid primary key default gen_random_uuid(),
  shop_id           uuid not null references shops (id) on delete cascade,
  acte_type         text not null check (acte_type in ('Freebox', 'Forfait mobile', 'Téléphone')),
  seuil_individuel  numeric(10,2) not null default 0,
  boost_individuel  numeric(10,2) not null default 0,
  boost_collectif   numeric(10,2) not null default 0,
  unique (shop_id, acte_type)
);

alter table paliers_primes enable row level security;

drop policy if exists paliers_select on paliers_primes;
create policy paliers_select on paliers_primes
  for select using (
    shop_id in (select shop_id from profiles where id = auth.uid())
  );

drop policy if exists paliers_admin_write on paliers_primes;
create policy paliers_admin_write on paliers_primes
  for all using (
    exists (select 1 from profiles p
            where p.id = auth.uid() and p.role = 'admin' and p.shop_id = paliers_primes.shop_id)
  ) with check (
    exists (select 1 from profiles p
            where p.id = auth.uid() and p.role = 'admin' and p.shop_id = paliers_primes.shop_id)
  );

insert into paliers_primes (shop_id, acte_type, seuil_individuel, boost_individuel, boost_collectif)
select s.id, t.acte_type, 0, 0, 0
from shops s
cross join (values ('Freebox'), ('Forfait mobile'), ('Téléphone')) as t(acte_type)
on conflict (shop_id, acte_type) do nothing;

-- ============================================================
-- 5. VENTES — sous-produit vendu
-- ============================================================
alter table ventes
  add column if not exists sous_type_id uuid references sous_types_actes (id) on delete set null;

create index if not exists ventes_shop_created_idx on ventes (shop_id, created_at);

-- ============================================================
-- 6. PRIMES MENSUELLES — prime du mois ventilée, par vendeur
-- ============================================================
create table if not exists primes_mensuelles (
  id               uuid primary key default gen_random_uuid(),
  vendeur_id       uuid not null references profiles (id) on delete cascade,
  shop_id          uuid not null references shops (id) on delete cascade,
  mois             date not null,               -- 1er jour du mois
  prime_base       numeric(10,2) not null default 0,
  boost_individuel numeric(10,2) not null default 0,
  boost_collectif  numeric(10,2) not null default 0,
  bonus_mcafee     numeric(10,2) not null default 0,
  bonus_assurance  numeric(10,2) not null default 0,
  prime_totale     numeric(10,2) not null default 0,
  total_actes      integer not null default 0,
  updated_at       timestamptz not null default now(),
  unique (vendeur_id, mois)
);

create index if not exists primes_mensuelles_shop_mois_idx on primes_mensuelles (shop_id, mois);

alter table primes_mensuelles enable row level security;

drop policy if exists pm_select_own on primes_mensuelles;
create policy pm_select_own on primes_mensuelles
  for select using (vendeur_id = auth.uid());

drop policy if exists pm_select_admin on primes_mensuelles;
create policy pm_select_admin on primes_mensuelles
  for select using (
    exists (select 1 from profiles p
            where p.id = auth.uid() and p.role = 'admin' and p.shop_id = primes_mensuelles.shop_id)
  );

-- Réplication temps réel.
do $$
begin
  begin
    execute 'alter publication supabase_realtime add table primes_mensuelles';
  exception when duplicate_object then null;
  end;
end $$;

-- ============================================================
-- 7. RECALCUL DES PRIMES
-- ============================================================

-- 7a. Prime "de base" du jour (sans les boosts, qui sont mensuels).
--     Conserve primes_journalieres pour les vues journalières / hebdo.
create or replace function recalculer_prime_jour(p_vendeur uuid, p_date date)
returns void as $$
declare
  v_shop uuid;
begin
  select shop_id into v_shop from profiles where id = p_vendeur;

  insert into primes_journalieres (vendeur_id, date, total_ventes, prime_calculee, updated_at)
  select
    p_vendeur,
    p_date,
    coalesce(sum(v.quantity), 0),
    coalesce(sum(
        v.quantity * coalesce(st.montant_base, rp.montant_par_acte, 0)
      + case when v.has_mcafee    then v.quantity * coalesce(rp.bonus_mcafee, 0)    else 0 end
      + case when v.has_assurance then v.quantity * coalesce(rp.bonus_assurance, 0) else 0 end
    ), 0),
    now()
  from ventes v
  left join sous_types_actes st on st.id = v.sous_type_id
  left join regles_primes rp   on rp.shop_id = v_shop and rp.acte_type = v.acte_type
  where v.vendeur_id = p_vendeur
    and v.created_at::date = p_date
  on conflict (vendeur_id, date)
  do update set total_ventes   = excluded.total_ventes,
                prime_calculee = excluded.prime_calculee,
                updated_at     = now();
end;
$$ language plpgsql security definer;

-- 7b. Primes mensuelles de TOUTE la boutique pour un mois donné.
--     Recalcul global obligatoire : le boost collectif d'un vendeur dépend
--     des ventes de tous les autres.
create or replace function recalculer_primes_mois(p_shop_id uuid, p_ref date)
returns void as $$
declare
  m_start date := date_trunc('month', p_ref)::date;
  m_end   date := (date_trunc('month', p_ref) + interval '1 month')::date;
  b_mcafee    numeric := coalesce((select bonus_mcafee    from regles_primes where shop_id = p_shop_id and acte_type = 'Freebox'),   0);
  b_assurance numeric := coalesce((select bonus_assurance from regles_primes where shop_id = p_shop_id and acte_type = 'Téléphone'), 0);
begin
  -- Purge les vendeurs sans vente ce mois (sinon lignes fantômes).
  delete from primes_mensuelles pm
  where pm.shop_id = p_shop_id and pm.mois = m_start
    and not exists (
      select 1 from ventes v
      where v.vendeur_id = pm.vendeur_id
        and v.created_at >= m_start and v.created_at < m_end
    );

  with vm as (
    select
      v.vendeur_id,
      v.acte_type,
      v.quantity,
      v.has_mcafee,
      v.has_assurance,
      coalesce(st.montant_base, rp.montant_par_acte, 0) as montant_base
    from ventes v
    left join sous_types_actes st on st.id = v.sous_type_id
    left join regles_primes rp   on rp.shop_id = v.shop_id and rp.acte_type = v.acte_type
    where v.shop_id = p_shop_id
      and v.created_at >= m_start and v.created_at < m_end
  ),
  vat as (
    select vendeur_id, acte_type, sum(quantity) as qte
    from vm group by vendeur_id, acte_type
  ),
  shop_at as (
    select acte_type, sum(quantity) as qte_shop
    from vm group by acte_type
  ),
  obj_at as (
    select acte_type, max(valeur_cible) as cible_shop
    from objectifs
    where shop_id = p_shop_id and vendeur_id is null
      and type_cible = 'volume' and periode = 'mois' and acte_type is not null
      and date_debut < m_end and date_fin >= m_start
    group by acte_type
  ),
  pal as (
    select acte_type, seuil_individuel, boost_individuel, boost_collectif
    from paliers_primes where shop_id = p_shop_id
  ),
  base as (
    select
      vendeur_id,
      sum(quantity * montant_base)                                as prime_base,
      sum(quantity)                                               as total_actes,
      sum(case when has_mcafee    then quantity else 0 end)       as mcafee_qte,
      sum(case when has_assurance then quantity else 0 end)       as assurance_qte
    from vm group by vendeur_id
  ),
  bi as (
    select vat.vendeur_id,
           sum(greatest(vat.qte - coalesce(p.seuil_individuel, 0), 0) * coalesce(p.boost_individuel, 0)) as boost_ind
    from vat join pal p on p.acte_type = vat.acte_type
    group by vat.vendeur_id
  ),
  bc as (
    select vat.vendeur_id,
           sum(
             case
               when o.cible_shop is not null and s.qte_shop > o.cible_shop
               then ceil(coalesce(p.boost_collectif, 0) * vat.qte)
               else 0
             end
           ) as boost_col
    from vat
    join shop_at s on s.acte_type = vat.acte_type
    join pal p     on p.acte_type = vat.acte_type
    left join obj_at o on o.acte_type = vat.acte_type
    group by vat.vendeur_id
  )
  insert into primes_mensuelles (
    vendeur_id, shop_id, mois, prime_base, boost_individuel, boost_collectif,
    bonus_mcafee, bonus_assurance, prime_totale, total_actes, updated_at)
  select
    base.vendeur_id,
    p_shop_id,
    m_start,
    round(coalesce(base.prime_base, 0), 2),
    round(coalesce(bi.boost_ind, 0), 2),
    round(coalesce(bc.boost_col, 0), 2),
    round(coalesce(base.mcafee_qte, 0) * b_mcafee, 2),
    round(coalesce(base.assurance_qte, 0) * b_assurance, 2),
    round(
        coalesce(base.prime_base, 0)
      + coalesce(bi.boost_ind, 0)
      + coalesce(bc.boost_col, 0)
      + coalesce(base.mcafee_qte, 0) * b_mcafee
      + coalesce(base.assurance_qte, 0) * b_assurance
    , 2),
    coalesce(base.total_actes, 0),
    now()
  from base
  left join bi on bi.vendeur_id = base.vendeur_id
  left join bc on bc.vendeur_id = base.vendeur_id
  on conflict (vendeur_id, mois)
  do update set
    prime_base       = excluded.prime_base,
    boost_individuel = excluded.boost_individuel,
    boost_collectif  = excluded.boost_collectif,
    bonus_mcafee     = excluded.bonus_mcafee,
    bonus_assurance  = excluded.bonus_assurance,
    prime_totale     = excluded.prime_totale,
    total_actes      = excluded.total_actes,
    updated_at       = now();
end;
$$ language plpgsql security definer;

-- 7c. Trigger AFTER INSERT ON ventes : recalcul jour + mois.
create or replace function trg_vente_after_insert()
returns trigger as $$
begin
  perform recalculer_prime_jour(new.vendeur_id, new.created_at::date);
  perform recalculer_primes_mois(new.shop_id, new.created_at::date);
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_recalcul_prime on ventes;
drop trigger if exists trg_vente_after_insert on ventes;
create trigger trg_vente_after_insert
  after insert on ventes
  for each row execute function trg_vente_after_insert();

-- 7d. Recalcul complet d'une boutique (appelé par l'admin après édition du
--     barème ou des objectifs). Garde le nom historique pour compatibilité.
create or replace function recalculer_primes_du_jour(p_shop_id uuid)
returns void as $$
begin
  perform recalculer_primes_mois(p_shop_id, current_date);
  perform recalculer_prime_jour(id, current_date)
    from profiles where shop_id = p_shop_id and role = 'vendeur';
end;
$$ language plpgsql security definer;

create or replace function recalculer_primes_boutique(p_shop_id uuid, p_ref date default current_date)
returns void as $$
begin
  perform recalculer_primes_mois(p_shop_id, p_ref);
  perform recalculer_prime_jour(id, p_ref)
    from profiles where shop_id = p_shop_id and role = 'vendeur';
end;
$$ language plpgsql security definer;

grant execute on function recalculer_primes_du_jour(uuid)          to authenticated;
grant execute on function recalculer_primes_boutique(uuid, date)   to authenticated;

-- ============================================================
-- 8. VUE progression_objectifs — volume + taux + jours travaillés
-- ============================================================
create view progression_objectifs as
with agg as (
  select
    o.id,
    o.shop_id,
    o.vendeur_id,
    o.periode,
    o.date_debut,
    o.date_fin,
    o.acte_type,
    o.type_cible,
    coalesce(o.valeur_cible, o.nb_ventes_cible) as valeur_cible,
    o.nb_ventes_cible,
    -- Volume réalisé (numérateur)
    coalesce(sum(
      case
        when o.acte_type is null then v.quantity
        when o.acte_type in ('Freebox', 'Forfait mobile', 'Téléphone')
             and v.acte_type = o.acte_type then v.quantity
        when o.acte_type = 'McAfee'
             and v.acte_type = 'Freebox' and v.has_mcafee then v.quantity
        when o.acte_type = 'Assurance'
             and v.acte_type = 'Téléphone' and v.has_assurance then v.quantity
        else 0
      end
    ) filter (
      where v.created_at::date between o.date_debut and o.date_fin
        and (o.vendeur_id is null or v.vendeur_id = o.vendeur_id)
    ), 0) as volume_realise,
    -- Dénominateur du taux (Freebox vendues pour McAfee, Téléphones pour Assurance)
    coalesce(sum(
      case
        when o.acte_type = 'McAfee'    and v.acte_type = 'Freebox'   then v.quantity
        when o.acte_type = 'Assurance' and v.acte_type = 'Téléphone' then v.quantity
        else 0
      end
    ) filter (
      where v.created_at::date between o.date_debut and o.date_fin
        and (o.vendeur_id is null or v.vendeur_id = o.vendeur_id)
    ), 0) as taux_base,
    -- Jours travaillés (uniquement pour un objectif conseiller)
    case
      when o.vendeur_id is null then null
      else (
        select count(*) from planning pl
        where pl.vendeur_id = o.vendeur_id
          and pl.statut = 'present'
          and pl.date between o.date_debut and o.date_fin
      )
    end as jours_travailles
  from objectifs o
  left join ventes v on v.shop_id = o.shop_id
  group by o.id
)
select
  agg.*,
  agg.id as objectif_id,
  agg.volume_realise as nb_ventes_realise,
  case when agg.taux_base > 0
       then round(agg.volume_realise::numeric / agg.taux_base * 100, 1)
       else 0 end as taux_realise
from agg;

commit;

-- ============================================================
-- Après migration : recalculer les primes mensuelles existantes, ex.
--   select recalculer_primes_boutique(id) from shops;
-- ============================================================
