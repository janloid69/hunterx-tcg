-- HunterX TCG: Discord bot (Phase 3, part 2)
--
-- The bot runs on the HunterX server with a Supabase secret key. Triggers below
-- write events to bot_outbox; the bot picks them up and:
--   * posts new listings to the market channel and edits them when sold,
--   * posts vouches to the vouch channel,
--   * DMs members about new messages, offers and finished deals,
--   * opens a ticket for every report in the mod channel, with buttons,
--   * keeps in_guild / Verified Seller / Mod in sync with Discord roles.
--
-- Only the secret key (service_role) can touch the bot's tables and functions.
-- The website only gets one new thing: members can turn the bot's DMs off.

-- ---------------------------------------------------------------------------
-- Members choose whether the bot DMs them
-- ---------------------------------------------------------------------------

alter table public.profiles add column discord_dms boolean not null default true;

comment on column public.profiles.discord_dms is
  'When true, the HunterX bot DMs the member on Discord about new messages and deals.';

create or replace function public.set_discord_dms(p_enabled boolean)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles set discord_dms = coalesce(p_enabled, true) where id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Tables the bot works from
-- ---------------------------------------------------------------------------

-- Things that happened on the website, for the bot to act on in order.
create table public.bot_outbox (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('listing', 'message', 'offer', 'vouch', 'report')),
  ref_id uuid not null,
  event text not null check (event in ('created', 'updated', 'deleted')),
  available_at timestamptz not null default now(),
  claimed_at timestamptz,
  attempts integer not null default 0,
  last_error text,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create index bot_outbox_pending_idx on public.bot_outbox (id) where processed_at is null;
create index bot_outbox_ref_idx on public.bot_outbox (kind, ref_id) where processed_at is null;

-- Discord messages the bot posted, so it can edit or delete them later.
-- kind: 'listing', 'vouch', 'report', or a one-off DM such as 'dm:sold'.
create table public.bot_discord_posts (
  kind text not null,
  ref_id uuid not null,
  channel_id text,
  message_id text,
  thread_id text,
  state text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (kind, ref_id)
);

-- ---------------------------------------------------------------------------
-- Writing events
-- ---------------------------------------------------------------------------

-- Adds an event unless the same thing is already waiting: the bot always reads
-- the latest state, so one waiting event per listing or report is enough.
create or replace function public.bot_enqueue(p_kind text, p_ref_id uuid, p_event text, p_delay interval default '0')
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_event <> 'deleted' and exists (
    select 1 from public.bot_outbox o
    where o.kind = p_kind and o.ref_id = p_ref_id and o.event <> 'deleted'
      and o.processed_at is null and o.claimed_at is null
  ) then
    return;
  end if;
  insert into public.bot_outbox (kind, ref_id, event, available_at)
  values (p_kind, p_ref_id, p_event, now() + p_delay);
end;
$$;

create or replace function public.bot_listings_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  rpt record;
begin
  if tg_op = 'INSERT' then
    perform public.bot_enqueue('listing', new.id, 'created');
  elsif tg_op = 'DELETE' then
    perform public.bot_enqueue('listing', old.id, 'deleted');
  else
    if row(new.status, new.hidden_at, new.title, new.description, new.price, new.photos, new.kind,
           new.condition, new.grader, new.grade, new.quantity, new.meetup, new.meetup_area,
           new.shipping, new.payment_methods, new.buyer_id, new.sold_price)
       is distinct from
       row(old.status, old.hidden_at, old.title, old.description, old.price, old.photos, old.kind,
           old.condition, old.grader, old.grade, old.quantity, old.meetup, old.meetup_area,
           old.shipping, old.payment_methods, old.buyer_id, old.sold_price) then
      perform public.bot_enqueue('listing', new.id, 'updated');
    end if;
    -- Report tickets show whether the listing is hidden.
    if new.hidden_at is distinct from old.hidden_at then
      for rpt in select r.id from public.reports r where r.listing_id = new.id loop
        perform public.bot_enqueue('report', rpt.id, 'updated');
      end loop;
    end if;
  end if;
  return null;
end;
$$;

create trigger bot_listings_changed
  after insert or update or delete on public.listings
  for each row execute function public.bot_listings_changed();

-- Messages and offer answers wait a minute, so nobody gets a DM for a chat
-- they're reading right now.
create or replace function public.bot_messages_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.kind in ('text', 'offer') then
      perform public.bot_enqueue('message', new.id, 'created', interval '1 minute');
    end if;
  elsif new.offer_status is distinct from old.offer_status and new.offer_status in ('accepted', 'declined') then
    perform public.bot_enqueue('offer', new.id, 'updated', interval '1 minute');
  end if;
  return null;
end;
$$;

create trigger bot_messages_changed
  after insert or update of offer_status on public.messages
  for each row execute function public.bot_messages_changed();

create or replace function public.bot_vouches_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform public.bot_enqueue('vouch', old.id, 'deleted');
  else
    perform public.bot_enqueue('vouch', new.id, 'created');
  end if;
  return null;
end;
$$;

create trigger bot_vouches_changed
  after insert or delete on public.vouches
  for each row execute function public.bot_vouches_changed();

create or replace function public.bot_reports_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.bot_enqueue('report', new.id, 'created');
  elsif new.status is distinct from old.status then
    perform public.bot_enqueue('report', new.id, 'updated');
  end if;
  return null;
end;
$$;

create trigger bot_reports_changed
  after insert or update of status on public.reports
  for each row execute function public.bot_reports_changed();

-- ---------------------------------------------------------------------------
-- Functions the bot calls
-- ---------------------------------------------------------------------------

-- Hands the bot the next events that are due, oldest first. Events the bot
-- took but never finished (it crashed) come back after 10 minutes.
create or replace function public.bot_next_events(p_limit integer default 20)
returns setof public.bot_outbox
language sql
security definer
set search_path = ''
as $$
  update public.bot_outbox o
     set claimed_at = now(), attempts = o.attempts + 1
   where o.id in (
     select q.id from public.bot_outbox q
      where q.processed_at is null
        and q.available_at <= now()
        and q.attempts < 10
        and (q.claimed_at is null or q.claimed_at < now() - interval '10 minutes')
      order by q.id
      limit greatest(coalesce(p_limit, 20), 0)
      for update skip locked
   )
  returning o.*;
$$;

-- Marks an event done, or schedules a retry (2, 4, 8 ... up to 60 minutes).
create or replace function public.bot_finish_event(p_id bigint, p_error text default null)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.bot_outbox
     set processed_at = case when p_error is null then now() end,
         claimed_at = null,
         last_error = left(p_error, 1000),
         available_at = case
           when p_error is null then available_at
           else now() + least(power(2, attempts), 60) * interval '1 minute'
         end
   where id = p_id;
$$;

-- Drops old finished events.
create or replace function public.bot_cleanup()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer;
begin
  delete from public.bot_outbox
   where (processed_at is not null and processed_at < now() - interval '14 days')
      or (processed_at is null and attempts >= 10 and created_at < now() - interval '30 days');
  get diagnostics removed = row_count;
  return removed;
end;
$$;

-- Writes Discord roles onto profiles. p_members: [{"id": "<discord user id>",
-- "roles": ["<role id>", ...]}]. p_left: Discord user ids that left the
-- server. p_full: p_members is everyone in the server, so anyone missing has
-- left. Same rules as the discord-sync Edge Function. Returns rows changed.
create or replace function public.bot_sync_roles(
  p_members jsonb,
  p_left text[] default '{}',
  p_full boolean default false,
  p_circle_role text default null,
  p_mod_role text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  members jsonb := coalesce(p_members, '[]'::jsonb);
  changed integer := 0;
  n integer;
begin
  if p_full and jsonb_array_length(members) = 0 then
    raise exception 'A full sync needs the member list';
  end if;

  with incoming as (
    select m ->> 'id' as discord_id,
           array(select jsonb_array_elements_text(coalesce(m -> 'roles', '[]'::jsonb))) as roles
    from jsonb_array_elements(members) m
  ),
  wanted as (
    select p.id,
           coalesce(nullif(p_circle_role, '') = any(i.roles), false) as verified,
           coalesce(nullif(p_mod_role, '') = any(i.roles), false) as moderator
    from incoming i
    join public.profiles p on p.discord_id = i.discord_id
  )
  update public.profiles p
     set in_guild = true,
         is_verified_seller = w.verified,
         is_mod = w.moderator,
         roles_synced_at = now()
    from wanted w
   where p.id = w.id
     and row(p.in_guild, p.is_verified_seller, p.is_mod) is distinct from row(true, w.verified, w.moderator);
  get diagnostics n = row_count;
  changed := changed + n;

  update public.profiles p
     set in_guild = false, is_verified_seller = false, is_mod = false, roles_synced_at = now()
   where p.discord_id is not null
     and (p.in_guild or p.is_verified_seller or p.is_mod)
     and (
       p.discord_id = any(coalesce(p_left, '{}'))
       or (p_full and not exists (
         select 1 from jsonb_array_elements(members) m where m ->> 'id' = p.discord_id
       ))
     );
  get diagnostics n = row_count;
  changed := changed + n;

  return changed;
end;
$$;

-- A mod pressed a button on a report ticket in Discord. The bot has already
-- checked their Mod role there; this acts as that mod's HunterX account, so
-- the usual rules apply and the report records who handled it.
create or replace function public.bot_moderate(p_discord_id text, p_report_id uuid, p_action text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  mod_id uuid;
  rpt public.reports;
begin
  select p.id into mod_id from public.profiles p where p.discord_id = p_discord_id and p.is_mod;
  if mod_id is null then
    raise exception 'No HunterX mod account for this Discord user'
      using errcode = '42501',
            hint = 'Sign in to the HunterX website once with Discord, then try again.';
  end if;

  perform set_config('request.jwt.claim.sub', mod_id::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', mod_id, 'role', 'authenticated')::text, true);

  select * into rpt from public.reports where id = p_report_id;
  if rpt.id is null then
    raise exception 'This report no longer exists';
  end if;

  case p_action
    when 'resolve' then update public.reports set status = 'resolved' where id = rpt.id;
    when 'dismiss' then update public.reports set status = 'dismissed' where id = rpt.id;
    when 'reopen' then update public.reports set status = 'open' where id = rpt.id;
    when 'hide' then
      if rpt.listing_id is null then raise exception 'This report isn''t about a listing'; end if;
      update public.listings set hidden_at = now() where id = rpt.listing_id and hidden_at is null;
    when 'restore' then
      if rpt.listing_id is null then raise exception 'This report isn''t about a listing'; end if;
      update public.listings set hidden_at = null where id = rpt.listing_id;
    else
      raise exception 'Unknown action %', p_action;
  end case;
end;
$$;

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------

alter table public.bot_outbox enable row level security;
alter table public.bot_discord_posts enable row level security;
-- No policies on purpose: only the secret key (which skips row rules) gets in.

revoke all on public.bot_outbox, public.bot_discord_posts from public, anon, authenticated;
grant all on public.bot_outbox, public.bot_discord_posts to service_role;

revoke execute on function
  public.bot_enqueue(text, uuid, text, interval),
  public.bot_listings_changed(), public.bot_messages_changed(),
  public.bot_vouches_changed(), public.bot_reports_changed(),
  public.bot_next_events(integer), public.bot_finish_event(bigint, text), public.bot_cleanup(),
  public.bot_sync_roles(jsonb, text[], boolean, text, text),
  public.bot_moderate(text, uuid, text)
from public, anon, authenticated;

grant execute on function
  public.bot_next_events(integer), public.bot_finish_event(bigint, text), public.bot_cleanup(),
  public.bot_sync_roles(jsonb, text[], boolean, text, text),
  public.bot_moderate(text, uuid, text)
to service_role;

revoke execute on function public.set_discord_dms(boolean) from public, anon;
grant execute on function public.set_discord_dms(boolean) to authenticated, service_role;
