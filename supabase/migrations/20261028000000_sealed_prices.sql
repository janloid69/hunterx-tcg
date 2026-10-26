-- HunterX TCG: sealed product prices
--
--   * Sealed products (booster boxes, Elite Trainer Boxes, packs, tins,
--     collections) for Pokémon, One Piece and Riftbound are copied in by the
--     card sync from TCGCSV, a free daily copy of TCGplayer's catalog and
--     market prices. Members pick them when adding to a binder or listing.
--   * catalog_prices: a HunterX price for sealed products and toys from sales
--     on HunterX, plus the TCGplayer market price in pesos.
--   * The binder value now counts sealed products and toys too.
--
-- Run once in Supabase (SQL Editor → New query → paste → Run), after the
-- earlier migrations.

-- ---------------------------------------------------------------------------
-- Catalog items from a data source
-- ---------------------------------------------------------------------------

alter table public.catalog_items
  add column source text,
  add column source_id text,
  add column market_usd numeric(12, 2) check (market_usd is null or market_usd > 0),
  add column market_updated_at timestamptz,
  add column product_url text,
  add column released_on date;

-- One row per product from each source (member suggestions have no source).
alter table public.catalog_items add constraint catalog_items_source_key unique (source, source_id);

create index catalog_items_line_trgm_idx on public.catalog_items using gin (line extensions.gin_trgm_ops);
create index catalog_items_kind_released_idx on public.catalog_items (kind, released_on desc nulls last);
create index sales_catalog_item_idx on public.sales (catalog_item_id, sold_at desc) where catalog_item_id is not null;

-- Members' suggestions can't claim a source or a price.
drop policy "Members can suggest catalog items" on public.catalog_items;
create policy "Members can suggest catalog items"
  on public.catalog_items for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and status = 'pending'
    and merged_into is null
    and source is null
    and source_id is null
    and market_usd is null
    and market_updated_at is null
    and product_url is null
    and released_on is null
  );

-- Used by the card sync (service role only). New products arrive approved;
-- for products already here only the price, link and missing details change,
-- so a mod's name fix or merge is never undone.
create or replace function public.sync_catalog_products(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed integer;
begin
  insert into public.catalog_items as ci (
    game_id, kind, name, brand, line, image_url, status, created_by,
    source, source_id, market_usd, market_updated_at, product_url, released_on
  )
  select distinct on (r.source, r.source_id)
    r.game_id, 'sealed', left(btrim(r.name), 120), left(nullif(btrim(r.brand), ''), 60),
    left(nullif(btrim(r.line), ''), 80), nullif(r.image_url, ''), 'approved', null,
    r.source, r.source_id,
    case when r.market_usd > 0 then round(r.market_usd, 2) end,
    case when r.market_usd > 0 then coalesce(r.market_updated_at, now()) end,
    nullif(r.product_url, ''), r.released_on
  from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as r (
    game_id text, name text, brand text, line text, image_url text, source text, source_id text,
    market_usd numeric, market_updated_at timestamptz, product_url text, released_on date
  )
  where r.source is not null
    and r.source_id is not null
    and char_length(btrim(coalesce(r.name, ''))) >= 2
    and exists (select 1 from public.games g where g.id = r.game_id)
  -- If a product comes twice, keep the copy with a picture and a price.
  order by r.source, r.source_id, (r.image_url is null), (r.market_usd is null)
  on conflict (source, source_id) do update
     set market_usd = excluded.market_usd,
         market_updated_at = excluded.market_updated_at,
         product_url = coalesce(excluded.product_url, ci.product_url),
         image_url = coalesce(ci.image_url, excluded.image_url),
         released_on = coalesce(ci.released_on, excluded.released_on);
  get diagnostics changed = row_count;
  return changed;
end;
$$;

-- ---------------------------------------------------------------------------
-- Prices
-- ---------------------------------------------------------------------------

-- Both prices for each sealed product or toy, like card_prices. The HunterX
-- price is the median of up to 15 sales in the last year (Near mint or Lightly
-- played for toys). Always filter by catalog_item_id.
create view public.catalog_prices
with (security_invoker = true)
as
select
  ci.id as catalog_item_id,
  l.local_php,
  l.local_sales,
  l.local_low,
  l.local_high,
  l.last_sold_php,
  l.last_sold_at,
  g.global_php,
  g.global_source,
  ci.market_updated_at as global_updated_at,
  coalesce(l.local_php, g.global_php) as value_php
from public.catalog_items ci
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
    where s.catalog_item_id = ci.id
      and s.kind in ('sealed', 'item')
      and coalesce(s.condition, 'NM') in ('NM', 'LP')
      and s.sold_at > now() - interval '1 year'
    order by s.sold_at desc
    limit 15
  ) r
) l on true
left join lateral (
  select
    case when ci.market_usd is not null and usd.php is not null then round(ci.market_usd * usd.php) end as global_php,
    case when ci.market_usd is not null and usd.php is not null then 'TCGplayer' end as global_source
  from (select 1) one
  left join public.fx_rates usd on usd.currency = 'USD'
) g on true;

-- The signed-in member's binder value: raw cards plus sealed products and toys.
-- (Graded slabs aren't priced yet.) The first three columns are unchanged.
create or replace view public.my_collection_value
with (security_invoker = true)
as
with cards as (
  select
    coalesce(sum(ci.quantity * p.value_php), 0) as value_php,
    coalesce(sum(ci.quantity) filter (where p.value_php is not null), 0) as priced,
    coalesce(sum(ci.quantity), 0) as total
  from public.collection_items ci
  left join public.card_prices p on p.card_id = ci.card_id
  where ci.user_id = (select auth.uid()) and ci.kind = 'card'
),
items as (
  select
    coalesce(sum(ci.quantity * p.value_php), 0) as value_php,
    coalesce(sum(ci.quantity) filter (where p.value_php is not null), 0) as priced,
    coalesce(sum(ci.quantity), 0) as total
  from public.collection_items ci
  left join public.catalog_prices p on p.catalog_item_id = ci.catalog_item_id
  where ci.user_id = (select auth.uid()) and ci.kind in ('sealed', 'item')
)
select
  (cards.value_php + items.value_php)::numeric(14, 2) as value_php,
  cards.priced::integer as priced_cards,
  cards.total::integer as raw_cards,
  items.priced::integer as priced_items,
  items.total::integer as items
from cards, items;

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------

revoke all on public.catalog_prices from anon, authenticated;
grant select on public.catalog_prices to authenticated;
grant all on public.catalog_prices to service_role;
grant select on public.my_collection_value to authenticated;

revoke execute on function public.sync_catalog_products(jsonb) from public, anon, authenticated;
grant execute on function public.sync_catalog_products(jsonb) to service_role;
