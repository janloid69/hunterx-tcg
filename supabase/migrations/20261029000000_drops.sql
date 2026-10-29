-- HunterX TCG: upcoming drops
--
-- The latest posts from the server's #upcoming-drops channel, copied in by the
-- HunterX bot, for the website's Community page. The bot replaces the list on
-- every read, so edits and deletions in Discord show up on the site too.
-- Only Verified Sellers (the hunterxcircle role) and mods can see them.
--
-- Run once in Supabase (SQL Editor → New query → paste → Run), after the
-- earlier migrations.

create table public.community_drops (
  id text primary key,                                  -- the Discord message ID
  author_name text not null,
  author_avatar text,
  content text not null default '',                     -- mentions already turned into names
  attachments jsonb not null default '[]'::jsonb,       -- [{ url, kind, name, width, height }]
  reply jsonb,                                          -- { author, content } when it replies to a post
  posted_at timestamptz not null,
  edited_at timestamptz,
  url text not null,                                    -- link to the post in Discord
  updated_at timestamptz not null default now()
);

create index community_drops_posted_idx on public.community_drops (posted_at desc);

alter table public.community_drops enable row level security;

-- True for Verified Sellers and mods.
create or replace function public.can_see_drops()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p.is_verified_seller or p.is_mod from public.profiles p where p.id = auth.uid()), false)
$$;

create policy "Verified Sellers and mods see upcoming drops"
  on public.community_drops for select to authenticated
  using ((select public.can_see_drops()));

revoke all on public.community_drops from anon, authenticated;
grant select on public.community_drops to authenticated;
grant all on public.community_drops to service_role;

revoke execute on function public.can_see_drops() from public, anon;
grant execute on function public.can_see_drops() to authenticated, service_role;
