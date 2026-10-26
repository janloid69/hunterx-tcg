-- Checks sealed products from the card sync, catalog prices and the binder
-- value with sealed products. Runs after the earlier tests (uses their USD
-- rate of 58).
--
-- People:  ...61 member   ...62 mod

insert into auth.users (id, raw_user_meta_data) values
  ('cccccccc-0000-0000-0000-000000000061', '{"name": "sealedfan"}'),
  ('cccccccc-0000-0000-0000-000000000062', '{"name": "sealedmod"}');
update public.profiles set in_guild = true where id = 'cccccccc-0000-0000-0000-000000000061';
update public.profiles set in_guild = true, is_mod = true where id = 'cccccccc-0000-0000-0000-000000000062';

-- The sync adds products --------------------------------------------------------

set role service_role;
do $$
declare
  n integer;
begin
  n := public.sync_catalog_products('[
    {"game_id": "pokemon", "name": "Prismatic Evolutions Elite Trainer Box", "brand": "Pokémon",
     "line": "SV: Prismatic Evolutions", "image_url": "https://tcgplayer-cdn.tcgplayer.com/product/593355_400w.jpg",
     "source": "tcgcsv", "source_id": "593355", "market_usd": 89.99, "market_updated_at": "2026-10-27T00:00:00Z",
     "product_url": "https://www.tcgplayer.com/product/593355", "released_on": "2025-01-17"},
    {"game_id": "pokemon", "name": "Prismatic Evolutions Elite Trainer Box", "brand": "Pokémon",
     "line": "SV: Prismatic Evolutions", "source": "tcgcsv", "source_id": "593355", "market_usd": 89.99},
    {"game_id": "one-piece", "name": "Romance Dawn Booster Box", "brand": "One Piece",
     "line": "Romance Dawn", "source": "tcgcsv", "source_id": "450086", "market_usd": null},
    {"game_id": "nope", "name": "Unknown game box", "source": "tcgcsv", "source_id": "1"},
    {"game_id": "pokemon", "name": "x", "source": "tcgcsv", "source_id": "2"}
  ]'::jsonb);
  if n <> 2 then
    raise exception 'expected 2 products saved (duplicates, unknown games and bad names skipped), got %', n;
  end if;
  if (select row(kind, status, market_usd, game_id)::text from public.catalog_items where source_id = '593355')
     <> row('sealed', 'approved', 89.99::numeric(12, 2), 'pokemon')::text then
    raise exception 'synced product saved wrongly';
  end if;
  if (select market_updated_at from public.catalog_items where source_id = '450086') is not null then
    raise exception 'a product without a price should have no price date';
  end if;
end $$;
reset role;

-- A mod renames one; the next sync updates the price but keeps the name.
set role authenticated;
select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000062', false) as _ \gset
select public.mod_save_catalog_item(
  (select id from public.catalog_items where source_id = '593355'),
  'Prismatic Evolutions ETB', 'Pokémon', 'Prismatic Evolutions') as _ \gset
reset role;

set role service_role;
select public.sync_catalog_products('[
  {"game_id": "pokemon", "name": "Prismatic Evolutions Elite Trainer Box", "brand": "Pokémon",
   "line": "SV: Prismatic Evolutions", "source": "tcgcsv", "source_id": "593355", "market_usd": 95.5,
   "market_updated_at": "2026-11-03T00:00:00Z"}
]'::jsonb) as _ \gset
do $$
begin
  if (select row(name, market_usd, image_url is not null)::text from public.catalog_items where source_id = '593355')
     <> row('Prismatic Evolutions ETB', 95.50::numeric(12, 2), true)::text then
    raise exception 'sync should update the price but keep the mod''s name and the image: %',
      (select row(name, market_usd, image_url)::text from public.catalog_items where source_id = '593355');
  end if;
end $$;
reset role;

-- Members ----------------------------------------------------------------------

set role authenticated;
select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000061', false) as _ \gset
do $$
declare
  etb uuid := (select id from public.catalog_items where source_id = '593355');
  p record;
begin
  -- Synced products are visible to members, with both prices.
  if etb is null then
    raise exception 'members should see synced products';
  end if;
  select * into p from public.catalog_prices where catalog_item_id = etb;
  if p.global_php <> round(95.5 * 58) or p.global_source <> 'TCGplayer' or p.local_php is not null or p.value_php <> p.global_php then
    raise exception 'global price wrong: %', row_to_json(p);
  end if;

  -- Members can't fake a source or a price on their suggestions.
  begin
    insert into public.catalog_items (kind, game_id, name, market_usd) values ('sealed', 'pokemon', 'Fake priced box', 1);
    raise exception 'a member added a priced item';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.catalog_items (kind, game_id, name, source, source_id) values ('sealed', 'pokemon', 'Fake synced box', 'tcgcsv', '999');
    raise exception 'a member added a synced item';
  exception when insufficient_privilege then null;
  end;
  insert into public.catalog_items (kind, game_id, name) values ('sealed', 'pokemon', 'My own sealed suggestion');

  -- And they can't run the sync.
  begin
    perform public.sync_catalog_products('[]'::jsonb);
    raise exception 'members can run the catalog sync';
  exception when insufficient_privilege then null;
  end;

  -- Binder value counts sealed products.
  insert into public.collection_items (catalog_item_id, kind, quantity) values (etb, 'sealed', 2);
  if (select row(value_php, priced_items, items)::text from public.my_collection_value)
     <> row((2 * round(95.5 * 58))::numeric(14, 2), 2, 2)::text then
    raise exception 'binder value should count the sealed product: %', (select row_to_json(v) from public.my_collection_value v);
  end if;
end $$;
reset role;

-- HunterX sales make the HunterX price, and it wins over the global one.
set role service_role;
insert into public.sales (game_id, catalog_item_id, kind, price, sold_at)
select 'pokemon', id, 'sealed', price, now() - make_interval(days => d)
from public.catalog_items, (values (5200, 3), (5600, 2), (6000, 1), (100, 400)) as v (price, d)
where source_id = '593355';
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000061', false) as _ \gset
do $$
declare
  p record;
begin
  select * into p from public.catalog_prices where catalog_item_id = (select id from public.catalog_items where source_id = '593355');
  if p.local_php <> 5600 or p.local_sales <> 3 or p.last_sold_php <> 6000 or p.value_php <> 5600 then
    raise exception 'HunterX price should be the median of the last year''s sales: %', row_to_json(p);
  end if;
  if (select value_php from public.my_collection_value) <> 2 * 5600 then
    raise exception 'binder value should use the HunterX price';
  end if;
end $$;
reset role;

set role anon;
do $$
begin
  begin
    perform 1 from public.catalog_prices;
    raise exception 'signed-out visitors can read catalog prices';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false) as _ \gset

select 'All sealed price checks passed' as result;
