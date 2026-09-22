-- ============================================================
-- Migration 007 — Options "flat" configurables par l'admin
-- ============================================================
-- À exécuter une fois dans le SQL Editor de Supabase, après
-- 006_modeles_telephones_options.sql.
--
-- Résumé :
--  1. options_flat : catalogue d'options (nom, type d'acte, bonus €, actif,
--     ordre) éditable par l'admin, en remplacement des 5 colonnes figées
--     regles_primes.bonus_mcafee / bonus_assurance / bonus_coque /
--     bonus_reprise / bonus_garantie.
--  2. Reprise des 5 options existantes (montants copiés depuis
--     regles_primes). Chacune garde une `legacy_key` qui la relie à
--     l'ancienne colonne booléenne de ventes (has_mcafee, …) : les ventes
--     historiques continuent de toucher leur bonus, même si l'admin renomme
--     l'option.
--  3. ventes.options : tableau jsonb des ids (texte) des options cochées
--     sur la vente. Les colonnes has_* restent alimentées pour les options
--     historiques (objectifs de taux McAfee/Assurance, badges, vue
--     progression_objectifs).
--  4. primes_mensuelles.bonus_options (total) + bonus_options_detail
--     (ventilation par option, jsonb). Les colonnes bonus_mcafee, … restent
--     remplies pour compatibilité.
--  5. recalculer_prime_jour / recalculer_primes_mois : le bonus d'une vente
--     = quantité × Σ montant_bonus des options_flat cochées, une option
--     étant "cochée" si son id figure dans ventes.options OU si sa
--     legacy_key correspond à un booléen has_* vrai (jamais comptée deux
--     fois).
--
-- Notes :
--  - Désactiver une option (actif = false) la retire seulement du
--    formulaire de vente : les ventes passées gardent leur bonus.
--  - Supprimer une option retire son bonus de toutes les ventes (y compris
--    passées) au prochain recalcul.
--  - Les colonnes regles_primes.bonus_* ne sont plus lues ; elles sont
--    conservées (non supprimées) pour pouvoir revenir en arrière.
-- ============================================================

begin;

-- ============================================================
-- 1. TABLE options_flat
-- ============================================================
create table if not exists options_flat (
  id            uuid primary key default gen_random_uuid(),
  shop_id       uuid not null references shops (id) on delete cascade,
  nom           text not null,
  acte_type     text not null,
  montant_bonus numeric(10,2) not null default 0,
  actif         boolean not null default true,
  ordre         int not null default 0,
  -- Lien vers l'ancienne colonne booléenne ventes.has_<legacy_key>.
  legacy_key    text,
  created_at    timestamptz not null default now(),
  constraint options_flat_acte_type_chk
    check (acte_type in ('Freebox', 'Forfait mobile', 'Téléphone')),
  constraint options_flat_legacy_key_chk
    check (legacy_key is null or legacy_key in ('mcafee', 'assurance', 'coque', 'reprise', 'garantie')),
  unique (shop_id, acte_type, nom)
);

create index if not exists options_flat_shop_idx on options_flat (shop_id, acte_type, ordre);
create unique index if not exists options_flat_legacy_uidx
  on options_flat (shop_id, legacy_key) where legacy_key is not null;

alter table options_flat enable row level security;

drop policy if exists options_flat_select on options_flat;
create policy options_flat_select on options_flat
  for select using (
    shop_id in (select shop_id from profiles where id = auth.uid())
  );

drop policy if exists options_flat_admin_insert on options_flat;
create policy options_flat_admin_insert on options_flat
  for insert with check (
    exists (select 1 from profiles p
            where p.id = auth.uid() and p.role = 'admin' and p.shop_id = options_flat.shop_id)
  );

drop policy if exists options_flat_admin_update on options_flat;
create policy options_flat_admin_update on options_flat
  for update using (
    exists (select 1 from profiles p
            where p.id = auth.uid() and p.role = 'admin' and p.shop_id = options_flat.shop_id)
  ) with check (
    exists (select 1 from profiles p
            where p.id = auth.uid() and p.role = 'admin' and p.shop_id = options_flat.shop_id)
  );

drop policy if exists options_flat_admin_delete on options_flat;
create policy options_flat_admin_delete on options_flat
  for delete using (
    exists (select 1 from profiles p
            where p.id = auth.uid() and p.role = 'admin' and p.shop_id = options_flat.shop_id)
  );

-- ============================================================
-- 2. REPRISE des 5 options historiques (idempotent)
-- ============================================================
insert into options_flat (shop_id, nom, acte_type, montant_bonus, actif, ordre, legacy_key)
select s.id, d.nom, d.acte_type, coalesce(d.montant, 0), true, d.ordre, d.legacy_key
from shops s
cross join lateral (
  values
    ('McAfee',           'Freebox',   0, 'mcafee',
       (select bonus_mcafee    from regles_primes r where r.shop_id = s.id and r.acte_type = 'Freebox')),
    ('Assurance mobile', 'Téléphone', 0, 'assurance',
       (select bonus_assurance from regles_primes r where r.shop_id = s.id and r.acte_type = 'Téléphone')),
    ('Coque',            'Téléphone', 1, 'coque',
       (select bonus_coque     from regles_primes r where r.shop_id = s.id and r.acte_type = 'Téléphone')),
    ('Reprise',          'Téléphone', 2, 'reprise',
       (select bonus_reprise   from regles_primes r where r.shop_id = s.id and r.acte_type = 'Téléphone')),
    ('Garantie',         'Téléphone', 3, 'garantie',
       (select bonus_garantie  from regles_primes r where r.shop_id = s.id and r.acte_type = 'Téléphone'))
) as d(nom, acte_type, ordre, legacy_key, montant)
on conflict do nothing;

-- ============================================================
-- 3. VENTES.options — ids des options cochées
-- ============================================================
alter table ventes
  add column if not exists options jsonb not null default '[]'::jsonb;

-- ============================================================
-- 4. PRIMES_MENSUELLES — total + ventilation des bonus options
-- ============================================================
alter table primes_mensuelles
  add column if not exists bonus_options        numeric(10,2) not null default 0,
  add column if not exists bonus_options_detail jsonb not null default '[]'::jsonb;

-- ============================================================
-- 5. RECALCUL
-- ============================================================

-- Une option est cochée sur une vente si son id figure dans ventes.options,
-- ou (ventes historiques) si le booléen has_<legacy_key> est vrai.
create or replace function option_cochee(o options_flat, v ventes)
returns boolean as $$
  select o.shop_id = v.shop_id
     and o.acte_type = v.acte_type
     and (
          coalesce(v.options, '[]'::jsonb) ? o.id::text
       or (o.legacy_key = 'mcafee'    and v.has_mcafee)
       or (o.legacy_key = 'assurance' and v.has_assurance)
       or (o.legacy_key = 'coque'     and v.has_coque)
       or (o.legacy_key = 'reprise'   and v.has_reprise)
       or (o.legacy_key = 'garantie'  and v.has_garantie)
     );
$$ language sql stable;

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
      coalesce(mt.montant_base, st.montant_base, rp.montant_par_acte, 0) as montant_base
    from ventes v
    left join sous_types_actes st    on st.id = v.sous_type_id
    left join modeles_telephones mt  on mt.id = v.modele_id
    left join regles_primes rp       on rp.shop_id = v.shop_id and rp.acte_type = v.acte_type
    where v.shop_id = p_shop_id
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
-- 6. USAGE des options (avertissement avant suppression côté admin)
-- ============================================================
-- Nombre de ventes (toutes périodes) où chaque option de la boutique est
-- cochée. security invoker : soumis à la RLS de ventes de l'appelant.
create or replace function options_flat_usage(p_shop_id uuid)
returns table (option_id uuid, nb_ventes bigint) as $$
  select o.id, count(v.id)
  from options_flat o
  left join ventes v
    on v.shop_id = o.shop_id and v.acte_type = o.acte_type and option_cochee(o, v)
  where o.shop_id = p_shop_id
  group by o.id;
$$ language sql stable;

grant execute on function options_flat_usage(uuid) to authenticated;

commit;

-- ============================================================
-- Après migration : recalculer les primes du mois en cours, ex.
--   select recalculer_primes_boutique(id) from shops;
-- ============================================================
