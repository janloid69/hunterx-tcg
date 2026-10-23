-- HunterX TCG: initial schema (Phase 1: accounts, card database, binder)
--
-- Who can do what:
--   * Anyone can read games, sets and cards (public reference data).
--   * Members manage only their own binder (collection_items).
--   * Members can add toys and sealed products to the shared catalog; new
--     entries stay "pending" until a mod approves them.
--   * Discord roles (Verified Seller, Mod) are written only by the
--     discord-sync Edge Function, never by the app itself.

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profiles (one per signed-in member)
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  discord_id text unique,
  username text,
  display_name text,
  avatar_url text,
  in_guild boolean not null default false,
  is_verified_seller boolean not null default false,
  is_mod boolean not null default false,
  roles_synced_at timestamptz,
  created_at timestamptz not null default now()
);

comment on column public.profiles.is_verified_seller is
  'True while the member has the hunterxcircle role in the HunterX Discord.';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.profiles (id, discord_id, username, display_name, avatar_url)
  values (
    new.id,
    meta ->> 'provider_id',
    coalesce(meta ->> 'name', meta ->> 'full_name'),
    coalesce(meta -> 'custom_claims' ->> 'global_name', meta ->> 'full_name', meta ->> 'name'),
    meta ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Reference data: games, sets, cards
-- ---------------------------------------------------------------------------

create table public.games (
  id text primary key,
  name text not null,
  kind text not null check (kind in ('tcg', 'collectible')),
  has_card_numbers boolean not null default true,
  enabled boolean not null default false,
  sort_order integer not null default 100
);

insert into public.games (id, name, kind, has_card_numbers, enabled, sort_order) values
  ('pokemon', 'Pokémon', 'tcg', true, true, 10),
  ('one-piece', 'One Piece', 'tcg', true, true, 20),
  ('riftbound', 'Riftbound', 'tcg', true, true, 30),
  ('yugioh', 'Yu-Gi-Oh!', 'tcg', true, false, 40),
  ('gundam', 'Gundam', 'tcg', true, false, 50),
  ('final-fantasy', 'Final Fantasy', 'tcg', true, false, 60),
  ('toys', 'Toys & collectibles', 'collectible', false, true, 90)
on conflict (id) do nothing;

create table public.card_sets (
  id text primary key,                 -- '<game>:<source set id>', e.g. 'pokemon:sv8'
  game_id text not null references public.games (id),
  code text,                           -- printed code, e.g. 'SSP' or 'OP-01'
  name text not null,
  series text,
  release_date date,
  card_count integer check (card_count >= 0),
  logo_url text,
  source text not null,
  updated_at timestamptz not null default now()
);

create index card_sets_game_release_idx on public.card_sets (game_id, release_date desc);

create table public.cards (
  id text primary key,                 -- '<game>:<source card id>', e.g. 'pokemon:sv8-238'
  game_id text not null references public.games (id),
  set_id text not null references public.card_sets (id) on delete cascade,
  number text not null,                -- as printed, e.g. '238' or 'OP01-001'
  sort_number integer,                 -- numeric part, for binder order
  name text not null,
  rarity text,
  image_small text,
  image_large text,
  source text not null,
  updated_at timestamptz not null default now()
);

create index cards_set_order_idx on public.cards (set_id, sort_number, number);
create index cards_game_number_idx on public.cards (game_id, number);
create index cards_name_trgm_idx on public.cards using gin (name extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Shared catalog for toys and sealed products (no public card database)
-- ---------------------------------------------------------------------------

create table public.catalog_items (
  id uuid primary key default gen_random_uuid(),
  game_id text not null default 'toys' references public.games (id),
  kind text not null default 'toy' check (kind in ('toy', 'sealed')),
  name text not null check (char_length(name) between 2 and 120),
  brand text check (char_length(brand) <= 60),
  line text check (char_length(line) <= 80),
  image_url text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'merged')),
  merged_into uuid references public.catalog_items (id),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index catalog_items_name_trgm_idx on public.catalog_items using gin (name extensions.gin_trgm_ops);
create index catalog_items_created_by_idx on public.catalog_items (created_by);

-- ---------------------------------------------------------------------------
-- Binder: what each member owns
-- ---------------------------------------------------------------------------

create table public.collection_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  card_id text references public.cards (id) on delete restrict,
  catalog_item_id uuid references public.catalog_items (id) on delete restrict,
  kind text not null default 'card' check (kind in ('card', 'graded', 'sealed', 'item')),
  quantity integer not null default 1 check (quantity between 1 and 999),
  condition text check (condition in ('NM', 'LP', 'MP', 'HP', 'DMG')),
  grader text check (grader in ('PSA', 'BGS', 'CGC', 'TAG', 'Other')),
  grade numeric(3, 1) check (grade between 1 and 10),
  price_paid numeric(12, 2) check (price_paid >= 0),
  notes text check (char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint collection_items_one_target
    check ((card_id is not null)::int + (catalog_item_id is not null)::int = 1),
  constraint collection_items_kind_matches_target
    check (
      (kind in ('card', 'graded') and card_id is not null)
      or (kind in ('sealed', 'item') and catalog_item_id is not null)
    ),
  constraint collection_items_grade_needs_grader
    check (kind <> 'graded' or (grader is not null and grade is not null))
);

create index collection_items_user_created_idx on public.collection_items (user_id, created_at desc);
create index collection_items_user_card_idx on public.collection_items (user_id, card_id);
create index collection_items_catalog_idx on public.collection_items (catalog_item_id);

create trigger collection_items_set_updated_at
  before update on public.collection_items
  for each row execute function public.set_updated_at();

-- Set completion for the signed-in member. security_invoker makes the view
-- respect the caller's row-level security, so members only see their own.
create view public.my_set_progress
with (security_invoker = true)
as
select
  s.id as set_id,
  s.game_id,
  s.name,
  s.code,
  s.release_date,
  coalesce(s.card_count, 0) as total_cards,
  count(distinct ci.card_id)::integer as owned_cards,
  sum(ci.quantity)::integer as copies
from public.collection_items ci
join public.cards c on c.id = ci.card_id
join public.card_sets s on s.id = c.set_id
where ci.user_id = auth.uid()
group by s.id;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.games enable row level security;
alter table public.card_sets enable row level security;
alter table public.cards enable row level security;
alter table public.catalog_items enable row level security;
alter table public.collection_items enable row level security;

create policy "Members can see member profiles"
  on public.profiles for select to authenticated
  using (true);

create policy "Anyone can read games"
  on public.games for select to anon, authenticated
  using (true);

create policy "Anyone can read sets"
  on public.card_sets for select to anon, authenticated
  using (true);

create policy "Anyone can read cards"
  on public.cards for select to anon, authenticated
  using (true);

create policy "Members see approved catalog items and their own"
  on public.catalog_items for select to authenticated
  using (status = 'approved' or created_by = (select auth.uid()));

create policy "Members can suggest catalog items"
  on public.catalog_items for insert to authenticated
  with check (created_by = (select auth.uid()) and status = 'pending' and merged_into is null);

create policy "Members read their own binder"
  on public.collection_items for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Members add to their own binder"
  on public.collection_items for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "Members edit their own binder"
  on public.collection_items for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Members remove from their own binder"
  on public.collection_items for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Table access for the website (least privilege)
--
-- Start from nothing, then grant only what the site uses. This works the same
-- whether or not the project has "Automatically expose new tables" turned on.
-- Row-level security above still decides which rows each member can touch.
-- ---------------------------------------------------------------------------

revoke all on
  public.profiles, public.games, public.card_sets, public.cards,
  public.catalog_items, public.collection_items, public.my_set_progress
from anon, authenticated;

grant select on public.games, public.card_sets, public.cards to anon, authenticated;
grant select on public.profiles to authenticated;
grant select, insert on public.catalog_items to authenticated;
grant select, insert, update, delete on public.collection_items to authenticated;
grant select on public.my_set_progress to authenticated;

-- The card sync and the discord-sync function use the service role.
grant all on
  public.profiles, public.games, public.card_sets, public.cards,
  public.catalog_items, public.collection_items, public.my_set_progress
to service_role;
