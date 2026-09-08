-- ============================================================
-- Migration 001 — Commission par acte
-- ============================================================
-- À exécuter une fois dans l'éditeur SQL de Supabase (SQL Editor).
--
-- Le vendeur ne saisit plus de montant : seulement un type d'acte,
-- une quantité et deux options (McAfee sur Freebox, Assurance sur
-- Téléphone).
--
-- Prime du jour d'un vendeur =
--     Σ  quantité × montant_par_acte(acte)
--   + Σ  (McAfee coché)   × quantité × bonus_mcafee
--   + Σ  (Assurance cochée) × quantité × bonus_assurance
--
-- Hypothèse : une vente Freebox de quantité 3 avec McAfee coché
-- compte pour 3 McAfee (idem Assurance). Le nombre de McAfee /
-- Assurance suit donc la quantité de la ligne.
-- ============================================================

begin;

-- La vue dépend de ventes.montant / objectifs.montant_cible : on la supprime
-- d'abord, elle est recréée en section 6.
drop view if exists progression_objectifs;

-- ------------------------------------------------------------
-- 1. Table ventes
-- ------------------------------------------------------------
-- Renommages idempotents (ne font rien si déjà appliqués).
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_name = 'ventes' and column_name = 'type_acte') then
    alter table ventes rename column type_acte to acte_type;
  end if;
  if exists (select 1 from information_schema.columns
             where table_name = 'ventes' and column_name = 'quantite') then
    alter table ventes rename column quantite to quantity;
  end if;
end $$;

alter table ventes drop column if exists montant;

alter table ventes
  add column if not exists has_mcafee    boolean not null default false,
  add column if not exists has_assurance boolean not null default false;

-- Normalise les libellés d'acte existants vers les 3 valeurs officielles.
update ventes set acte_type = 'Freebox'
  where lower(acte_type) in ('freebox', 'box');
update ventes set acte_type = 'Forfait mobile'
  where lower(acte_type) in ('forfait', 'forfait mobile', 'mobile', 'abonnement');
update ventes set acte_type = 'Téléphone'
  where lower(acte_type) in ('telephone', 'téléphone', 'phone');
-- Tout acte non reconnu bascule sur 'Forfait mobile' (pas d'option).
update ventes set acte_type = 'Forfait mobile'
  where acte_type not in ('Freebox', 'Forfait mobile', 'Téléphone');

alter table ventes drop constraint if exists ventes_acte_type_chk;
alter table ventes
  add constraint ventes_acte_type_chk
  check (acte_type in ('Freebox', 'Forfait mobile', 'Téléphone'));

-- ------------------------------------------------------------
-- 2. Table objectifs — plus de cible en euros, uniquement en actes
-- ------------------------------------------------------------
alter table objectifs drop column if exists montant_cible;

-- ------------------------------------------------------------
-- 3. Table regles_primes — une ligne par type d'acte / boutique
-- ------------------------------------------------------------
alter table regles_primes drop column if exists nom;
alter table regles_primes drop column if exists seuil_min;
alter table regles_primes drop column if exists seuil_max;
alter table regles_primes drop column if exists taux_pourcentage;
alter table regles_primes drop column if exists montant_fixe;
alter table regles_primes drop column if exists actif;

alter table regles_primes
  add column if not exists acte_type        text,
  add column if not exists montant_par_acte numeric(10,2) not null default 0,
  add column if not exists bonus_mcafee     numeric(10,2) not null default 0,
  add column if not exists bonus_assurance  numeric(10,2) not null default 0;

-- Purge des anciennes lignes de barème (paliers de CA).
delete from regles_primes where acte_type is null;

alter table regles_primes alter column acte_type set not null;
alter table regles_primes drop constraint if exists regles_primes_acte_type_chk;
alter table regles_primes
  add constraint regles_primes_acte_type_chk
  check (acte_type in ('Freebox', 'Forfait mobile', 'Téléphone'));

create unique index if not exists regles_primes_shop_acte_uidx
  on regles_primes (shop_id, acte_type);

-- Crée les 3 lignes de barème (valeurs à 0) pour chaque boutique.
insert into regles_primes (shop_id, acte_type, montant_par_acte, bonus_mcafee, bonus_assurance)
select s.id, t.acte_type, 0, 0, 0
from shops s
cross join (values ('Freebox'), ('Forfait mobile'), ('Téléphone')) as t(acte_type)
on conflict (shop_id, acte_type) do nothing;

-- ------------------------------------------------------------
-- 4. Recalcul de la prime à chaque vente insérée
-- ------------------------------------------------------------
create or replace function recalculer_prime()
returns trigger as $$
declare
  v_shop_id     uuid;
  v_total_actes integer := 0;
  v_prime       numeric(10,2) := 0;
begin
  select shop_id into v_shop_id from profiles where id = new.vendeur_id;

  select
    coalesce(sum(v.quantity), 0),
    coalesce(sum(
        v.quantity * coalesce(r.montant_par_acte, 0)
      + case when v.has_mcafee    then v.quantity * coalesce(r.bonus_mcafee, 0)    else 0 end
      + case when v.has_assurance then v.quantity * coalesce(r.bonus_assurance, 0) else 0 end
    ), 0)
  into v_total_actes, v_prime
  from ventes v
  left join regles_primes r
    on  r.shop_id   = v_shop_id
    and r.acte_type = v.acte_type
  where v.vendeur_id = new.vendeur_id
    and v.created_at::date = new.created_at::date;

  insert into primes_journalieres (vendeur_id, date, total_ventes, prime_calculee, updated_at)
  values (new.vendeur_id, new.created_at::date, v_total_actes, v_prime, now())
  on conflict (vendeur_id, date)
  do update set total_ventes   = excluded.total_ventes,
                prime_calculee = excluded.prime_calculee,
                updated_at     = now();

  return new;
end;
$$ language plpgsql security definer;

-- Le trigger trg_recalcul_prime (AFTER INSERT ON ventes) reste en place.
-- On le (re)crée au cas où la base ne l'aurait pas.
drop trigger if exists trg_recalcul_prime on ventes;
create trigger trg_recalcul_prime
after insert on ventes
for each row execute function recalculer_prime();

-- ------------------------------------------------------------
-- 5. Recalcul de toutes les primes du jour d'une boutique
--    (appelé par l'admin après modification du barème, pour que
--     l'affichage temps réel se mette à jour immédiatement)
-- ------------------------------------------------------------
create or replace function recalculer_primes_du_jour(p_shop_id uuid)
returns void as $$
  insert into primes_journalieres (vendeur_id, date, total_ventes, prime_calculee, updated_at)
  select
    v.vendeur_id,
    v.created_at::date,
    coalesce(sum(v.quantity), 0),
    coalesce(sum(
        v.quantity * coalesce(r.montant_par_acte, 0)
      + case when v.has_mcafee    then v.quantity * coalesce(r.bonus_mcafee, 0)    else 0 end
      + case when v.has_assurance then v.quantity * coalesce(r.bonus_assurance, 0) else 0 end
    ), 0),
    now()
  from ventes v
  left join regles_primes r
    on  r.shop_id   = p_shop_id
    and r.acte_type = v.acte_type
  where v.shop_id = p_shop_id
    and v.created_at::date = current_date
  group by v.vendeur_id, v.created_at::date
  on conflict (vendeur_id, date)
  do update set total_ventes   = excluded.total_ventes,
                prime_calculee = excluded.prime_calculee,
                updated_at     = now();
$$ language sql security definer;

grant execute on function recalculer_primes_du_jour(uuid) to authenticated;

-- ------------------------------------------------------------
-- 6. Vue de progression vers les objectifs (en nombre d'actes)
-- ------------------------------------------------------------
create view progression_objectifs as
select
  o.id as id,
  o.id as objectif_id,
  o.shop_id,
  o.vendeur_id,
  o.periode,
  o.date_debut,
  o.date_fin,
  o.nb_ventes_cible,
  coalesce(sum(v.quantity) filter (
    where v.created_at::date between o.date_debut and o.date_fin
      and (o.vendeur_id is null or v.vendeur_id = o.vendeur_id)
  ), 0) as nb_ventes_realise
from objectifs o
left join ventes v on v.shop_id = o.shop_id
group by o.id;

commit;

-- ============================================================
-- Rappel : la réplication Realtime doit rester active sur
-- primes_journalieres :
--   alter publication supabase_realtime add table primes_journalieres;
-- ============================================================
