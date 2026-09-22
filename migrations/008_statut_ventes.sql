-- ============================================================
-- Migration 008 — Statut des ventes (validée / annulée)
-- ============================================================
-- À exécuter une fois dans le SQL Editor de Supabase, après
-- 007_options_flat.sql.
--
-- Résumé :
--  1. ventes.statut ('validée' | 'annulée', défaut 'validée') +
--     annulee_le, annulee_par, motif_annulation.
--  2. Garde-fou BEFORE UPDATE : une vente ne peut qu'être annulée (jamais
--     rétablie ni modifiée par ailleurs) ; annulee_le / annulee_par sont
--     posés par la base, pas par le client.
--  3. RLS : un vendeur peut annuler ses propres ventes du jour ; un admin
--     toutes les ventes de sa boutique. Plus de suppression physique.
--  4. Trigger AFTER UPDATE OF statut : recalcul prime du jour + du mois.
--  5. recalculer_prime_jour / recalculer_primes_mois : seules les ventes
--     validées comptent (base, options, boosts individuel et collectif).
--  6. Vue progression_objectifs : seules les ventes validées comptent.
--  7. Temps réel sur objectifs (rafraîchissement des pages Objectifs).
--
-- Après migration : recalcul (voir en bas du fichier) — sans effet sur les
-- montants puisque toutes les ventes existantes sont 'validée', mais
-- inoffensif.
-- ============================================================

begin;

-- ============================================================
-- 1. COLONNES
-- ============================================================
alter table ventes
  add column if not exists statut           text not null default 'validée',
  add column if not exists annulee_le       timestamptz,
  add column if not exists annulee_par      uuid references profiles (id) on delete set null,
  add column if not exists motif_annulation text;

alter table ventes drop constraint if exists ventes_statut_chk;
alter table ventes
  add constraint ventes_statut_chk check (statut in ('validée', 'annulée'));

create index if not exists ventes_shop_statut_idx on ventes (shop_id, statut, created_at);

-- ============================================================
-- 2. GARDE-FOU SUR LES MISES À JOUR
-- ============================================================
-- Appliqué aux utilisateurs connectés (auth.uid() non nul). Le SQL Editor
-- et la clé service_role (auth.uid() nul) gardent la main pour la
-- maintenance.
create or replace function trg_vente_before_update()
returns trigger as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if row(new.vendeur_id, new.shop_id, new.acte_type, new.quantity,
         new.has_mcafee, new.has_assurance, new.has_coque, new.has_reprise,
         new.has_garantie, new.options, new.sous_type_id, new.modele_id,
         new.created_at)
     is distinct from
     row(old.vendeur_id, old.shop_id, old.acte_type, old.quantity,
         old.has_mcafee, old.has_assurance, old.has_coque, old.has_reprise,
         old.has_garantie, old.options, old.sous_type_id, old.modele_id,
         old.created_at)
  then
    raise exception 'Une vente ne peut pas être modifiée, seulement annulée.';
  end if;

  if old.statut = 'annulée' then
    raise exception 'Cette vente est déjà annulée.';
  end if;

  if new.statut <> 'annulée' then
    raise exception 'Seule l''annulation d''une vente est autorisée.';
  end if;

  new.annulee_le  := now();
  new.annulee_par := auth.uid();
  new.motif_annulation := nullif(btrim(coalesce(new.motif_annulation, '')), '');
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_vente_before_update on ventes;
create trigger trg_vente_before_update
  before update on ventes
  for each row execute function trg_vente_before_update();

-- ============================================================
-- 3. RLS — qui peut annuler
-- ============================================================
-- Les politiques UPDATE / DELETE existantes (schéma initial) sont
-- remplacées : l'annulation est la seule écriture autorisée après saisie.
do $$
declare
  pol record;
begin
  for pol in
    select policyname, cmd from pg_policies
    where schemaname = 'public' and tablename = 'ventes'
      and cmd in ('UPDATE', 'DELETE')
  loop
    execute format('drop policy %I on ventes', pol.policyname);
  end loop;

  -- Une politique "ALL" accorderait aussi UPDATE/DELETE : on la signale
  -- sans la toucher (à vérifier à la main).
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'ventes' and cmd = 'ALL'
  loop
    raise notice 'Politique ALL sur ventes à vérifier : %', pol.policyname;
  end loop;
end $$;

create policy ventes_update_vendeur_jour on ventes
  for update using (
    vendeur_id = auth.uid() and created_at::date = current_date
  ) with check (
    vendeur_id = auth.uid() and created_at::date = current_date
  );

create policy ventes_update_admin on ventes
  for update using (
    exists (select 1 from profiles p
            where p.id = auth.uid() and p.role = 'admin' and p.shop_id = ventes.shop_id)
  ) with check (
    exists (select 1 from profiles p
            where p.id = auth.uid() and p.role = 'admin' and p.shop_id = ventes.shop_id)
  );

-- ============================================================
-- 4. RECALCUL APRÈS ANNULATION
-- ============================================================
create or replace function trg_vente_after_update()
returns trigger as $$
begin
  if new.statut is distinct from old.statut then
    perform recalculer_prime_jour(new.vendeur_id, new.created_at::date);
    perform recalculer_primes_mois(new.shop_id, new.created_at::date);
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_vente_after_update on ventes;
create trigger trg_vente_after_update
  after update of statut on ventes
  for each row execute function trg_vente_after_update();

-- ============================================================
-- 5. RECALCUL — ventes validées uniquement
-- ============================================================
-- Identiques à la migration 007, avec le filtre v.statut = 'validée'.
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
      + v.quantity * coalesce((
          select sum(o.montant_bonus) from options_flat o
          where o.shop_id = v.shop_id and o.acte_type = v.acte_type and option_cochee(o, v)
        ), 0)
    ), 0),
    now()
  from ventes v
  left join sous_types_actes st    on st.id = v.sous_type_id
  left join modeles_telephones mt  on mt.id = v.modele_id
  left join regles_primes rp       on rp.shop_id = v_shop and rp.acte_type = v.acte_type
  where v.vendeur_id = p_vendeur
    and v.created_at::date = p_date
    and v.statut = 'validée'
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
begin
  -- Purge les vendeurs sans vente validée ce mois (sinon lignes fantômes,
  -- ex. un vendeur dont toutes les ventes ont été annulées).
  delete from primes_mensuelles pm
  where pm.shop_id = p_shop_id and pm.mois = m_start
    and not exists (
      select 1 from ventes v
      where v.vendeur_id = pm.vendeur_id
        and v.statut = 'validée'
        and v.created_at >= m_start and v.created_at < m_end
    );

  with vm as (
    select
      v.vendeur_id,
      v.acte_type,
      v.quantity,
      coalesce(mt.montant_base, st.montant_base, rp.montant_par_acte, 0) as montant_base
    from ventes v
    left join sous_types_actes st    on st.id = v.sous_type_id
    left join modeles_telephones mt  on mt.id = v.modele_id
    left join regles_primes rp       on rp.shop_id = v.shop_id and rp.acte_type = v.acte_type
    where v.shop_id = p_shop_id
      and v.statut = 'validée'
      and v.created_at >= m_start and v.created_at < m_end
  ),
  -- Une ligne par (vendeur, option cochée) avec quantité et montant cumulés.
  opt as (
    select
      v.vendeur_id,
      o.id,
      o.nom,
      o.acte_type,
      o.ordre,
      o.legacy_key,
      sum(v.quantity)                   as qte,
      sum(v.quantity * o.montant_bonus) as montant
    from ventes v
    join options_flat o
      on o.shop_id = v.shop_id and o.acte_type = v.acte_type and option_cochee(o, v)
    where v.shop_id = p_shop_id
      and v.statut = 'validée'
      and v.created_at >= m_start and v.created_at < m_end
    group by v.vendeur_id, o.id, o.nom, o.acte_type, o.ordre, o.legacy_key
  ),
  opt_tot as (
    select
      vendeur_id,
      sum(montant)                                               as bonus_options,
      coalesce(sum(montant) filter (where legacy_key = 'mcafee'),    0) as b_mcafee,
      coalesce(sum(montant) filter (where legacy_key = 'assurance'), 0) as b_assurance,
      coalesce(sum(montant) filter (where legacy_key = 'coque'),     0) as b_coque,
      coalesce(sum(montant) filter (where legacy_key = 'reprise'),   0) as b_reprise,
      coalesce(sum(montant) filter (where legacy_key = 'garantie'),  0) as b_garantie,
      jsonb_agg(
        jsonb_build_object(
          'id', id, 'nom', nom, 'acte_type', acte_type,
          'qte', qte, 'montant', round(montant, 2))
        order by acte_type, ordre, nom
      ) as detail
    from opt group by vendeur_id
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
      sum(quantity * montant_base) as prime_base,
      sum(quantity)                as total_actes
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
    bonus_options, bonus_options_detail,
    prime_totale, total_actes, updated_at)
  select
    base.vendeur_id,
    p_shop_id,
    m_start,
    round(coalesce(base.prime_base, 0), 2),
    round(coalesce(bi.boost_ind, 0), 2),
    round(coalesce(bc.boost_col, 0), 2),
    round(coalesce(ot.b_mcafee, 0), 2),
    round(coalesce(ot.b_assurance, 0), 2),
    round(coalesce(ot.b_coque, 0), 2),
    round(coalesce(ot.b_reprise, 0), 2),
    round(coalesce(ot.b_garantie, 0), 2),
    round(coalesce(ot.bonus_options, 0), 2),
    coalesce(ot.detail, '[]'::jsonb),
    round(
        coalesce(base.prime_base, 0)
      + coalesce(bi.boost_ind, 0)
      + coalesce(bc.boost_col, 0)
      + coalesce(ot.bonus_options, 0)
    , 2),
    coalesce(base.total_actes, 0),
    now()
  from base
  left join bi      on bi.vendeur_id = base.vendeur_id
  left join bc      on bc.vendeur_id = base.vendeur_id
  left join opt_tot ot on ot.vendeur_id = base.vendeur_id
  on conflict (vendeur_id, mois)
  do update set
    prime_base           = excluded.prime_base,
    boost_individuel     = excluded.boost_individuel,
    boost_collectif      = excluded.boost_collectif,
    bonus_mcafee         = excluded.bonus_mcafee,
    bonus_assurance      = excluded.bonus_assurance,
    bonus_coque          = excluded.bonus_coque,
    bonus_reprise        = excluded.bonus_reprise,
    bonus_garantie       = excluded.bonus_garantie,
    bonus_options        = excluded.bonus_options,
    bonus_options_detail = excluded.bonus_options_detail,
    prime_totale         = excluded.prime_totale,
    total_actes          = excluded.total_actes,
    updated_at           = now();
end;
$$ language plpgsql security definer;

-- ============================================================
-- 6. VUE progression_objectifs — ventes validées uniquement
-- ============================================================
drop view if exists progression_objectifs;

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
  left join ventes v on v.shop_id = o.shop_id and v.statut = 'validée'
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

-- ============================================================
-- 7. TEMPS RÉEL
-- ============================================================
do $$
begin
  begin
    execute 'alter publication supabase_realtime add table ventes';
  exception when duplicate_object then null;
  end;
  begin
    execute 'alter publication supabase_realtime add table objectifs';
  exception when duplicate_object then null;
  end;
end $$;

commit;

-- ============================================================
-- Après migration : recalculer les primes du mois en cours, ex.
--   select recalculer_primes_boutique(id) from shops;
-- ============================================================
