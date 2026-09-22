-- ============================================================
-- Migration 006 — Modèles de téléphones + options Coque/Reprise/Garantie
-- ============================================================
-- À exécuter une fois dans le SQL Editor de Supabase, après
-- 005_avatars.sql.
--
-- Résumé :
--  1. modeles_telephones : catalogue de modèles (marque + nom) configurable
--     par l'admin, avec un montant de base € et une durée de validité en
--     mois (le modèle reste rattaché aux ventes déjà enregistrées même une
--     fois expiré ; seule sa proposition dans le formulaire de vente est
--     filtrée par l'application).
--  2. ventes.modele_id : le modèle vendu (Téléphone uniquement), prioritaire
--     sur sous_type_id pour le calcul du montant de base.
--  3. ventes.has_coque / has_reprise / has_garantie : nouvelles options
--     Téléphone, au même principe que has_mcafee / has_assurance.
--  4. regles_primes.bonus_coque / bonus_reprise / bonus_garantie : bonus
--     flat par acte, au même principe que bonus_mcafee / bonus_assurance.
--  5. primes_mensuelles : colonnes correspondantes, et recalcul des
--     fonctions recalculer_prime_jour / recalculer_primes_mois pour tenir
--     compte du modèle vendu et des 3 nouvelles options.
-- ============================================================

begin;

-- ============================================================
-- 1. MODELES DE TELEPHONES
-- ============================================================
create table if not exists modeles_telephones (
  id            uuid primary key default gen_random_uuid(),
  shop_id       uuid not null references shops (id) on delete cascade,
  nom           text not null,
  marque        text not null default '',
  montant_base  numeric(10,2) not null default 0,
  mois_validite int,
  actif         boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (shop_id, marque, nom)
);

create index if not exists modeles_telephones_shop_idx on modeles_telephones (shop_id);

alter table modeles_telephones enable row level security;

drop policy if exists modeles_select on modeles_telephones;
create policy modeles_select on modeles_telephones
  for select using (
    shop_id in (select shop_id from profiles where id = auth.uid())
  );

drop policy if exists modeles_admin_write on modeles_telephones;
create policy modeles_admin_write on modeles_telephones
  for all using (
    exists (select 1 from profiles p
            where p.id = auth.uid() and p.role = 'admin' and p.shop_id = modeles_telephones.shop_id)
  ) with check (
    exists (select 1 from profiles p
            where p.id = auth.uid() and p.role = 'admin' and p.shop_id = modeles_telephones.shop_id)
  );

-- Jeu de marques par défaut (montant à 0 ; l'admin ajuste le catalogue).
insert into modeles_telephones (shop_id, marque, nom, montant_base, mois_validite, actif)
select s.id, d.marque, d.nom, 0, null, true
from shops s
cross join (values
  ('iPhone',  'Autres/Option'),
  ('Samsung', 'Autres/Option'),
  ('Xiaomi',  'Autres/Option'),
  ('Google',  'Autres/Option'),
  ('Nothing', 'Autres/Option')
) as d(marque, nom)
on conflict (shop_id, marque, nom) do nothing;

-- ============================================================
-- 2. VENTES — modèle vendu + nouvelles options Téléphone
-- ============================================================
alter table ventes
  add column if not exists modele_id    uuid references modeles_telephones (id) on delete set null,
  add column if not exists has_coque    boolean not null default false,
  add column if not exists has_reprise  boolean not null default false,
  add column if not exists has_garantie boolean not null default false;

-- ============================================================
-- 3. REGLES_PRIMES — bonus flat des nouvelles options
-- ============================================================
alter table regles_primes
  add column if not exists bonus_coque    numeric(10,2) not null default 0,
  add column if not exists bonus_reprise  numeric(10,2) not null default 0,
  add column if not exists bonus_garantie numeric(10,2) not null default 0;

-- ============================================================
-- 4. PRIMES_MENSUELLES — colonnes correspondantes
-- ============================================================
alter table primes_mensuelles
  add column if not exists bonus_coque    numeric(10,2) not null default 0,
  add column if not exists bonus_reprise  numeric(10,2) not null default 0,
  add column if not exists bonus_garantie numeric(10,2) not null default 0;

-- ============================================================
-- 5. RECALCUL — prise en compte du modèle vendu + des 3 options
-- ============================================================
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
        v.quantity * coalesce(mt.montant_base, st.montant_base, rp.montant_par_acte, 0)
      + case when v.has_mcafee    then v.quantity * coalesce(rp.bonus_mcafee, 0)    else 0 end
      + case when v.has_assurance then v.quantity * coalesce(rp.bonus_assurance, 0) else 0 end
      + case when v.has_coque     then v.quantity * coalesce(rp.bonus_coque, 0)     else 0 end
      + case when v.has_reprise   then v.quantity * coalesce(rp.bonus_reprise, 0)   else 0 end
      + case when v.has_garantie  then v.quantity * coalesce(rp.bonus_garantie, 0)  else 0 end
    ), 0),
    now()
  from ventes v
  left join sous_types_actes st    on st.id = v.sous_type_id
  left join modeles_telephones mt  on mt.id = v.modele_id
  left join regles_primes rp       on rp.shop_id = v_shop and rp.acte_type = v.acte_type
  where v.vendeur_id = p_vendeur
    and v.created_at::date = p_date
  on conflict (vendeur_id, date)
  do update set total_ventes   = excluded.total_ventes,
                prime_calculee = excluded.prime_calculee,
                updated_at     = now();
end;
$$ language plpgsql security definer;

create or replace function recalculer_primes_mois(p_shop_id uuid, p_ref date)
returns void as $$
declare
  m_start date := date_trunc('month', p_ref)::date;
  m_end   date := (date_trunc('month', p_ref) + interval '1 month')::date;
  b_mcafee    numeric := coalesce((select bonus_mcafee    from regles_primes where shop_id = p_shop_id and acte_type = 'Freebox'),   0);
  b_assurance numeric := coalesce((select bonus_assurance from regles_primes where shop_id = p_shop_id and acte_type = 'Téléphone'), 0);
  b_coque     numeric := coalesce((select bonus_coque     from regles_primes where shop_id = p_shop_id and acte_type = 'Téléphone'), 0);
  b_reprise   numeric := coalesce((select bonus_reprise   from regles_primes where shop_id = p_shop_id and acte_type = 'Téléphone'), 0);
  b_garantie  numeric := coalesce((select bonus_garantie  from regles_primes where shop_id = p_shop_id and acte_type = 'Téléphone'), 0);
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
      v.has_coque,
      v.has_reprise,
      v.has_garantie,
      coalesce(mt.montant_base, st.montant_base, rp.montant_par_acte, 0) as montant_base
    from ventes v
    left join sous_types_actes st    on st.id = v.sous_type_id
    left join modeles_telephones mt  on mt.id = v.modele_id
    left join regles_primes rp       on rp.shop_id = v.shop_id and rp.acte_type = v.acte_type
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
      sum(case when has_assurance then quantity else 0 end)       as assurance_qte,
      sum(case when has_coque     then quantity else 0 end)       as coque_qte,
      sum(case when has_reprise   then quantity else 0 end)       as reprise_qte,
      sum(case when has_garantie  then quantity else 0 end)       as garantie_qte
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
    bonus_mcafee, bonus_assurance, bonus_coque, bonus_reprise, bonus_garantie,
    prime_totale, total_actes, updated_at)
  select
    base.vendeur_id,
    p_shop_id,
    m_start,
    round(coalesce(base.prime_base, 0), 2),
    round(coalesce(bi.boost_ind, 0), 2),
    round(coalesce(bc.boost_col, 0), 2),
    round(coalesce(base.mcafee_qte, 0) * b_mcafee, 2),
    round(coalesce(base.assurance_qte, 0) * b_assurance, 2),
    round(coalesce(base.coque_qte, 0) * b_coque, 2),
    round(coalesce(base.reprise_qte, 0) * b_reprise, 2),
    round(coalesce(base.garantie_qte, 0) * b_garantie, 2),
    round(
        coalesce(base.prime_base, 0)
      + coalesce(bi.boost_ind, 0)
      + coalesce(bc.boost_col, 0)
      + coalesce(base.mcafee_qte, 0) * b_mcafee
      + coalesce(base.assurance_qte, 0) * b_assurance
      + coalesce(base.coque_qte, 0) * b_coque
      + coalesce(base.reprise_qte, 0) * b_reprise
      + coalesce(base.garantie_qte, 0) * b_garantie
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
    bonus_coque      = excluded.bonus_coque,
    bonus_reprise    = excluded.bonus_reprise,
    bonus_garantie   = excluded.bonus_garantie,
    prime_totale     = excluded.prime_totale,
    total_actes      = excluded.total_actes,
    updated_at       = now();
end;
$$ language plpgsql security definer;

commit;

-- ============================================================
-- Après migration : recalculer les primes mensuelles existantes, ex.
--   select recalculer_primes_boutique(id) from shops;
-- ============================================================
