-- HunterX TCG: launch polish
--
--   * Mods review the toys and sealed products members add to the shared
--     catalog: approve (fixing the name first if needed), merge duplicates into
--     the right item, or remove ones nobody uses yet.
--   * Upcoming Discord server events, copied in by the HunterX bot, for the
--     Community page.

-- ---------------------------------------------------------------------------
-- Catalog review
-- ---------------------------------------------------------------------------

create policy "Mods see every catalog item"
  on public.catalog_items for select to authenticated
  using ((select public.is_mod()));

-- Items waiting for review, oldest first, with who suggested them and how many
-- members already use them.
create or replace function public.mod_catalog_queue()
returns table (
  id uuid,
  kind text,
  game_id text,
  name text,
  brand text,
  line text,
  image_url text,
  created_at timestamptz,
  added_by uuid,
  added_by_name text,
  in_binders integer,
  in_listings integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select ci.id, ci.kind, ci.game_id, ci.name, ci.brand, ci.line, ci.image_url, ci.created_at,
         p.id, coalesce(p.display_name, p.username),
         (select count(*) from public.collection_items x where x.catalog_item_id = ci.id)::integer,
         (select count(*) from public.listings l where l.catalog_item_id = ci.id)::integer
  from public.catalog_items ci
  left join public.profiles p on p.id = ci.created_by
  where public.is_mod() and ci.status = 'pending'
  order by ci.created_at
$$;

-- Saves a mod's fixes to an item and, by default, approves it.
create or replace function public.mod_save_catalog_item(
  p_id uuid,
  p_name text,
  p_brand text default null,
  p_line text default null,
  p_approve boolean default true
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_mod() then
    raise exception 'Only mods can review the catalog' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_name, ''))) < 2 then
    raise exception 'Give the item a name';
  end if;
  update public.catalog_items
     set name = left(trim(p_name), 120),
         brand = nullif(left(trim(coalesce(p_brand, '')), 60), ''),
         line = nullif(left(trim(coalesce(p_line, '')), 80), ''),
         status = case when p_approve then 'approved' else status end
   where id = p_id and status <> 'merged';
  if not found then
    raise exception 'Catalog item not found';
  end if;
end;
$$;

-- Folds a duplicate into the right item: binders, listings and sale prices
-- move over, and the duplicate stops showing in search.
create or replace function public.mod_merge_catalog_item(p_from uuid, p_into uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  src public.catalog_items;
  dst public.catalog_items;
begin
  if not public.is_mod() then
    raise exception 'Only mods can review the catalog' using errcode = '42501';
  end if;
  if p_from = p_into then
    raise exception 'Pick a different item to merge into';
  end if;
  select * into src from public.catalog_items where id = p_from;
  select * into dst from public.catalog_items where id = p_into;
  if src.id is null or src.status = 'merged' then
    raise exception 'Catalog item not found';
  end if;
  if dst.id is null or dst.status <> 'approved' then
    raise exception 'Merge into an approved item';
  end if;
  if src.kind <> dst.kind then
    raise exception 'Both items must be the same type (toy or sealed)';
  end if;

  update public.collection_items set catalog_item_id = dst.id where catalog_item_id = src.id;
  update public.listings set catalog_item_id = dst.id where catalog_item_id = src.id;
  update public.sales set catalog_item_id = dst.id where catalog_item_id = src.id;
  update public.catalog_items set merged_into = dst.id where merged_into = src.id;
  update public.catalog_items set status = 'merged', merged_into = dst.id where id = src.id;
end;
$$;

-- Deletes a pending item nobody has used yet (a typo or a joke entry).
create or replace function public.mod_remove_catalog_item(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_mod() then
    raise exception 'Only mods can review the catalog' using errcode = '42501';
  end if;
  if exists (select 1 from public.collection_items where catalog_item_id = p_id)
     or exists (select 1 from public.listings where catalog_item_id = p_id) then
    raise exception 'Members already use this item. Merge it into the right one instead.';
  end if;
  delete from public.catalog_items where id = p_id and status = 'pending';
  if not found then
    raise exception 'Only items waiting for review can be removed';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Discord server events (written by the bot)
-- ---------------------------------------------------------------------------

create table public.community_events (
  id text primary key, -- Discord's event id
  name text not null,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text,
  image_url text,
  interested integer,
  status text not null default 'scheduled' check (status in ('scheduled', 'active')),
  url text not null,
  updated_at timestamptz not null default now()
);

create index community_events_starts_idx on public.community_events (starts_at);

alter table public.community_events enable row level security;

create policy "Members see server events"
  on public.community_events for select to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------

revoke all on public.community_events from anon, authenticated;
grant select on public.community_events to authenticated;
grant all on public.community_events to service_role;

revoke execute on function
  public.mod_catalog_queue(),
  public.mod_save_catalog_item(uuid, text, text, text, boolean),
  public.mod_merge_catalog_item(uuid, uuid),
  public.mod_remove_catalog_item(uuid)
from public, anon;

grant execute on function
  public.mod_catalog_queue(),
  public.mod_save_catalog_item(uuid, text, text, text, boolean),
  public.mod_merge_catalog_item(uuid, uuid),
  public.mod_remove_catalog_item(uuid)
to authenticated, service_role;
