-- HunterX TCG: peso price guide and card scanner support (Phase 2)
--
-- Two prices for every card:
--   * HunterX price: what the card actually sold for here, in pesos. The median
--     of its recent raw (ungraded) Near Mint / Lightly Played sales, from the
--     marketplace plus sales Discord members log from elsewhere. A median, so one
--     silly price doesn't move it.
--   * Global price: the TCGplayer (US) or Cardmarket (EU) market price from the
--     nightly card sync, converted with that day's exchange rate. A reference.
--
-- Also: the binder's estimated value, and printed set totals for the scanner
-- ("238/191" identifies a Pokémon card by its set's printed total).

-- ---------------------------------------------------------------------------
-- Columns the card sync fills in
-- ---------------------------------------------------------------------------

alter table public.cards
  add column market_usd numeric(12, 2) check (market_usd >= 0),
  add column market_eur numeric(12, 2) check (market_eur >= 0),
  add column market_updated_at timestamptz;

alter table public.card_sets add column printed_total integer check (printed_total >= 0);

create index card_sets_game_code_idx on public.card_sets (game_id, code);

-- Exchange rates to pesos, refreshed by the card sync (e.g. USD: 1 USD = 58.1 PHP).
create table public.fx_rates (
  currency text primary key check (currency ~ '^[A-Z]{3}$'),
  php numeric(14, 6) not null check (php > 0),
  as_of date not null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Sales members log from elsewhere (Facebook groups, meetups, shops)
-- ---------------------------------------------------------------------------

alter table public.sales
  add column logged_by uuid references public.profiles (id) on delete set null,
  add column created_at timestamptz not null default now();

create index sales_logged_by_idx on public.sales (logged_by, created_at desc);
create index sales_recent_idx on public.sales (sold_at desc);

-- Logs a sale of a card for the price guide. Discord members only, up to 20 a
-- day, for sales in the last year.
create or replace function public.log_sale(
  p_card_id text,
  p_price numeric,
  p_kind text default 'card',
  p_condition text default 'NM',
  p_grader text default null,
  p_grade numeric default null,
  p_sold_on date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  today date := (now() at time zone 'Asia/Manila')::date;
  sold date := coalesce(p_sold_on, (now() at time zone 'Asia/Manila')::date);
  crd public.cards;
  new_id uuid;
begin
  if me is null then
    raise exception 'Sign in to log a sale' using errcode = '42501';
  end if;
  if not public.is_guild_member() then
    raise exception 'Only HunterX Discord members can log sales' using errcode = '42501';
  end if;

  select * into crd from public.cards where id = p_card_id;
  if crd.id is null then
    raise exception 'Card not found';
  end if;
  if p_kind not in ('card', 'graded') then
    raise exception 'Choose raw or graded';
  end if;
  if p_price is null or p_price < 1 or p_price > 10000000 then
    raise exception 'Enter a price between ₱1 and ₱10,000,000';
  end if;
  if sold > today or sold < today - 365 then
    raise exception 'The sale date must be within the last year';
  end if;
  if p_kind = 'card' and coalesce(p_condition, 'NM') not in ('NM', 'LP', 'MP', 'HP', 'DMG') then
    raise exception 'Unknown condition';
  end if;
  if p_kind = 'graded' and (p_grader not in ('PSA', 'BGS', 'CGC', 'TAG', 'Other') or p_grade is null
                            or p_grade < 1 or p_grade > 10) then
    raise exception 'Choose the grading company and a grade from 1 to 10';
  end if;
  if (select count(*) from public.sales s where s.logged_by = me and s.created_at > now() - interval '1 day') >= 20 then
    raise exception 'You can log up to 20 sales a day';
  end if;

  insert into public.sales (game_id, card_id, kind, condition, grader, grade, price, sold_at, source, logged_by)
  values (
    crd.game_id,
    crd.id,
    p_kind,
    case when p_kind = 'card' then coalesce(p_condition, 'NM') end,
    case when p_kind = 'graded' then p_grader end,
    case when p_kind = 'graded' then round(p_grade, 1) end,
    round(p_price, 2),
    -- Today's sales keep the exact time, so "last sold" is the latest one.
    case when sold = today then clock_timestamp() else (sold + time '12:00') at time zone 'Asia/Manila' end,
    'logged',
    me
  )
  returning id into new_id;
  return new_id;
end;
$$;

-- Removes a logged sale: your own, or any logged sale if you're a mod.
-- Marketplace sales can't be removed this way.
create or replace function public.remove_logged_sale(p_sale_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.sales s
   where s.id = p_sale_id
     and s.source = 'logged'
     and auth.uid() is not null
     and (s.logged_by = auth.uid() or public.is_mod());
  if not found then
    raise exception 'You can only remove sales you logged' using errcode = '42501';
  end if;
end;
$$;

-- A card's recent sales for its price guide, newest first. Says which ones the
-- signed-in member logged, without showing who logged the rest.
create or replace function public.card_sales(p_card_id text, p_limit integer default 30)
returns table (
  id uuid,
  price numeric,
  kind text,
  condition text,
  grader text,
  grade numeric,
  sold_at timestamptz,
  source text,
  mine boolean,
  can_remove boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.price, s.kind, s.condition, s.grader, s.grade, s.sold_at, s.source,
         coalesce(s.logged_by = auth.uid(), false),
         s.source = 'logged' and (coalesce(s.logged_by = auth.uid(), false) or public.is_mod())
  from public.sales s
  where auth.uid() is not null and s.card_id = p_card_id
  order by s.sold_at desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100)
$$;

-- ---------------------------------------------------------------------------
-- Prices for the website
-- ---------------------------------------------------------------------------

-- Both prices for each card, plus value_php: the HunterX price when there is
-- one, else the global price. Always filter by card_id.
create view public.card_prices
with (security_invoker = true)
as
select
  c.id as card_id,
  l.local_php,
  l.local_sales,
  l.local_low,
  l.local_high,
  l.last_sold_php,
  l.last_sold_at,
  g.global_php,
  g.global_source,
  c.market_updated_at as global_updated_at,
  coalesce(l.local_php, g.global_php) as value_php
from public.cards c
left join lateral (
  select
    round(percentile_cont(0.5) within group (order by r.price)::numeric) as local_php,
    count(*)::integer as local_sales,
    min(r.price) as local_low,
    max(r.price) as local_high,
    (array_agg(r.price order by r.sold_at desc))[1] as last_sold_php,
    max(r.sold_at) as last_sold_at
  from (
    select s.price, s.sold_at
    from public.sales s
    where s.card_id = c.id
      and s.kind = 'card'
      and coalesce(s.condition, 'NM') in ('NM', 'LP')
      and s.sold_at > now() - interval '1 year'
    order by s.sold_at desc
    limit 15
  ) r
) l on true
left join lateral (
  select
    case
      when c.market_usd is not null and usd.php is not null then round(c.market_usd * usd.php)
      when c.market_eur is not null and eur.php is not null then round(c.market_eur * eur.php)
    end as global_php,
    case
      when c.market_usd is not null and usd.php is not null then 'TCGplayer'
      when c.market_eur is not null and eur.php is not null then 'Cardmarket'
    end as global_source
  from (select 1) one
  left join public.fx_rates usd on usd.currency = 'USD'
  left join public.fx_rates eur on eur.currency = 'EUR'
) g on true;

-- The signed-in member's binder value: raw cards only (graded slabs and
-- sealed products aren't priced yet).
create view public.my_collection_value
with (security_invoker = true)
as
select
  coalesce(sum(ci.quantity * p.value_php), 0)::numeric(14, 2) as value_php,
  coalesce(sum(ci.quantity) filter (where p.value_php is not null), 0)::integer as priced_cards,
  coalesce(sum(ci.quantity), 0)::integer as raw_cards
from public.collection_items ci
left join public.card_prices p on p.card_id = ci.card_id
where ci.user_id = (select auth.uid()) and ci.kind = 'card';

-- Latest sales across HunterX, for the price guide page.
create view public.recent_sales
with (security_invoker = true)
as
select
  s.id,
  s.card_id,
  s.price,
  s.kind,
  s.condition,
  s.grader,
  s.grade,
  s.sold_at,
  s.source,
  c.name,
  c.number,
  c.image_small,
  c.game_id,
  cs.name as set_name
from public.sales s
join public.cards c on c.id = s.card_id
left join public.card_sets cs on cs.id = c.set_id;

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------

alter table public.fx_rates enable row level security;
create policy "Anyone can read exchange rates" on public.fx_rates for select using (true);

revoke all on public.fx_rates, public.card_prices, public.my_collection_value, public.recent_sales
  from anon, authenticated;
grant select on public.fx_rates to anon, authenticated;
grant select on public.card_prices, public.my_collection_value, public.recent_sales to authenticated;
grant all on public.fx_rates, public.card_prices, public.my_collection_value, public.recent_sales to service_role;

-- Members see sale prices but not who logged them.
revoke select on public.sales from authenticated;
grant select (id, listing_id, game_id, card_id, catalog_item_id, kind, condition, grader, grade, price, sold_at, source)
  on public.sales to authenticated;

revoke execute on function
  public.log_sale(text, numeric, text, text, text, numeric, date),
  public.remove_logged_sale(uuid),
  public.card_sales(text, integer)
from public, anon;

grant execute on function
  public.log_sale(text, numeric, text, text, text, numeric, date),
  public.remove_logged_sale(uuid),
  public.card_sales(text, integer)
to authenticated, service_role;
