-- HunterX TCG: upcoming drops
--
-- The latest posts from the server's #upcoming-drops channel, copied in by the
-- HunterX bot, for the website's Community page. The bot replaces the list on
-- every read, so edits and deletions in Discord show up on the site too.
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

create policy "Members see upcoming drops"
  on public.community_drops for select to authenticated
  using (true);

revoke all on public.community_drops from anon, authenticated;
grant select on public.community_drops to authenticated;
grant all on public.community_drops to service_role;
