-- HunterX TCG: marketplace (Phase 3, part 1)
--
-- Listings with photos, on-site messages and offers, vouches, reports and
-- blocks, a sales history for the peso price guide, and account deletion.
--
-- Who can do what:
--   * Signed-in members can browse listings and message sellers.
--   * Only members of the HunterX Discord (profiles.in_guild) can sell.
--   * Only the buyer and seller can read a conversation.
--   * Blocking stops new messages in both directions.
--   * Three different members reporting a listing hides it until a mod looks.
--   * Mods (profiles.is_mod) review reports and hide or restore listings.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  game_id text not null references public.games (id),
  card_id text references public.cards (id) on delete set null,
  catalog_item_id uuid references public.catalog_items (id) on delete set null,
  title text not null check (char_length(title) between 3 and 120),
  description text check (char_length(description) <= 2000),
  kind text not null check (kind in ('card', 'graded', 'sealed', 'item')),
  condition text check (condition in ('NM', 'LP', 'MP', 'HP', 'DMG')),
  grader text check (grader in ('PSA', 'BGS', 'CGC', 'TAG', 'Other')),
  grade numeric(3, 1) check (grade between 1 and 10),
  price numeric(12, 2) not null check (price > 0 and price <= 10000000),
  quantity integer not null default 1 check (quantity between 1 and 999),
  photos text[] not null default '{}' check (cardinality(photos) <= 6),
  meetup boolean not null default false,
  meetup_area text check (char_length(meetup_area) <= 80),
  shipping boolean not null default false,
  payment_methods text[] not null default '{}'
    check (payment_methods <@ array['GCash', 'Maya', 'Bank transfer', 'Cash']::text[]),
  status text not null default 'active' check (status in ('active', 'reserved', 'sold', 'removed')),
  sold_price numeric(12, 2) check (sold_price > 0),
  sold_at timestamptz,
  buyer_id uuid references public.profiles (id) on delete set null,
  hidden_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint listings_delivery check (meetup or shipping),
  constraint listings_graded check (kind <> 'graded' or (grader is not null and grade is not null))
);

create index listings_browse_idx on public.listings (status, created_at desc) where hidden_at is null;
create index listings_seller_idx on public.listings (seller_id, created_at desc);
create index listings_game_idx on public.listings (game_id, created_at desc);
create index listings_card_idx on public.listings (card_id);
create index listings_title_trgm_idx on public.listings using gin (title extensions.gin_trgm_ops);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  buyer_id uuid not null references public.profiles (id) on delete cascade,
  seller_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  buyer_last_read_at timestamptz not null default now(),
  seller_last_read_at timestamptz not null default 'epoch',
  constraint conversations_one_per_buyer unique (listing_id, buyer_id),
  constraint conversations_two_people check (buyer_id <> seller_id)
);

create index conversations_buyer_idx on public.conversations (buyer_id, last_message_at desc);
create index conversations_seller_idx on public.conversations (seller_id, last_message_at desc);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid references public.profiles (id) on delete cascade, -- null for system messages
  kind text not null default 'text' check (kind in ('text', 'offer', 'system')),
  body text check (char_length(body) <= 2000),
  offer_amount numeric(12, 2) check (offer_amount > 0 and offer_amount <= 10000000),
  offer_status text check (offer_status in ('pending', 'accepted', 'declined', 'withdrawn')),
  created_at timestamptz not null default now(),
  constraint messages_shape check (
    (kind = 'text' and sender_id is not null and char_length(body) >= 1 and offer_amount is null)
    or (kind = 'offer' and sender_id is not null and offer_amount is not null and offer_status is not null)
    or (kind = 'system' and sender_id is null and body is not null)
  )
);

create index messages_conversation_idx on public.messages (conversation_id, created_at);
create index messages_sender_idx on public.messages (sender_id);

create table public.vouches (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  subject_id uuid not null references public.profiles (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text check (char_length(comment) <= 500),
  created_at timestamptz not null default now(),
  constraint vouches_one_per_deal unique (listing_id, author_id),
  constraint vouches_not_self check (author_id <> subject_id)
);

create index vouches_subject_idx on public.vouches (subject_id, created_at desc);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  listing_id uuid references public.listings (id) on delete cascade,
  reported_user_id uuid references public.profiles (id) on delete cascade,
  message_id uuid references public.messages (id) on delete set null,
  reason text not null check (reason in ('scam', 'fake', 'prohibited', 'harassment', 'spam', 'other')),
  details text check (char_length(details) <= 1000),
  snapshot text,
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  handled_by uuid references public.profiles (id) on delete set null,
  handled_at timestamptz,
  created_at timestamptz not null default now(),
  constraint reports_has_target check (
    listing_id is not null or reported_user_id is not null or message_id is not null
  )
);

create index reports_status_idx on public.reports (status, created_at desc);
create index reports_listing_idx on public.reports (listing_id);

create table public.blocks (
  blocker_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocks_not_self check (blocker_id <> blocked_id)
);

create index blocks_blocked_idx on public.blocks (blocked_id);

-- Finished deals, for the peso price guide. Holds no member details, so it
-- stays even when the buyer or seller deletes their account.
create table public.sales (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid unique references public.listings (id) on delete set null,
  game_id text not null references public.games (id),
  card_id text references public.cards (id) on delete cascade,
  catalog_item_id uuid references public.catalog_items (id) on delete cascade,
  kind text not null,
  condition text,
  grader text,
  grade numeric(3, 1),
  price numeric(12, 2) not null check (price > 0),
  sold_at timestamptz not null default now(),
  source text not null default 'market' check (source in ('market', 'logged'))
);

create index sales_card_idx on public.sales (card_id, sold_at desc);

-- ---------------------------------------------------------------------------
-- Helper functions used by the security rules
-- ---------------------------------------------------------------------------

create or replace function public.is_mod()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p.is_mod from public.profiles p where p.id = auth.uid()), false)
$$;

create or replace function public.is_guild_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p.in_guild from public.profiles p where p.id = auth.uid()), false)
$$;

-- True when either person has blocked the other. Only answers for the
-- signed-in member's own pairs, so nobody can probe other people's blocks.
create or replace function public.is_blocked_between(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() in (a, b) and exists (
    select 1 from public.blocks bl
    where (bl.blocker_id = a and bl.blocked_id = b) or (bl.blocker_id = b and bl.blocked_id = a)
  )
$$;

-- ---------------------------------------------------------------------------
-- Listings: guard edits, record sales
-- ---------------------------------------------------------------------------

create or replace function public.listings_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  acting_mod boolean := auth.uid() is not null and public.is_mod();
begin
  -- Photos must live in the seller's own storage folder.
  if exists (select 1 from unnest(new.photos) photo where photo not like new.seller_id::text || '/%') then
    raise exception 'Listing photos must be uploaded by the seller' using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' then
    -- pg_trigger_depth() > 1 means our own report trigger is hiding the listing.
    if pg_trigger_depth() = 1 and auth.uid() is not null and not acting_mod then
      if new.hidden_at is distinct from old.hidden_at then
        raise exception 'Only mods can hide or restore listings' using errcode = '42501';
      end if;
      if new.seller_id <> old.seller_id or new.created_at <> old.created_at then
        raise exception 'Listings can''t change owner' using errcode = '42501';
      end if;
    end if;

    if new.status = 'sold' then
      if old.status <> 'sold' then
        new.sold_at := coalesce(new.sold_at, now());
      end if;
      if new.buyer_id is not null
         and new.buyer_id is distinct from old.buyer_id
         and not exists (
           select 1 from public.conversations c
           where c.listing_id = new.id and c.buyer_id = new.buyer_id
         ) then
        raise exception 'The buyer must be someone who messaged you about this listing';
      end if;
    else
      new.sold_at := null;
      new.sold_price := null;
      new.buyer_id := null;
    end if;
  end if;

  return new;
end;
$$;

create trigger listings_guard
  before insert or update on public.listings
  for each row execute function public.listings_guard();

create trigger listings_set_updated_at
  before update on public.listings
  for each row execute function public.set_updated_at();

create or replace function public.listings_record_sale()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'sold' and old.status <> 'sold' then
    insert into public.sales (listing_id, game_id, card_id, catalog_item_id, kind, condition, grader, grade, price, sold_at)
    values (new.id, new.game_id, new.card_id, new.catalog_item_id, new.kind, new.condition, new.grader,
            new.grade, coalesce(new.sold_price, new.price), new.sold_at)
    on conflict (listing_id) do update set price = excluded.price, sold_at = excluded.sold_at;
  elsif old.status = 'sold' and new.status <> 'sold' then
    delete from public.sales where listing_id = new.id;
  elsif new.status = 'sold' and new.sold_price is distinct from old.sold_price then
    update public.sales set price = coalesce(new.sold_price, new.price) where listing_id = new.id;
  end if;
  return null;
end;
$$;

create trigger listings_record_sale
  after update of status, sold_price on public.listings
  for each row execute function public.listings_record_sale();

-- ---------------------------------------------------------------------------
-- Messages: shape new messages, keep conversations up to date, offers
-- ---------------------------------------------------------------------------

create or replace function public.messages_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.kind = 'offer' then
    new.offer_status := 'pending';
  else
    new.offer_status := null;
    new.offer_amount := null;
  end if;
  new.created_at := now();
  return new;
end;
$$;

create trigger messages_before_insert
  before insert on public.messages
  for each row execute function public.messages_before_insert();

create or replace function public.messages_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations c
     set last_message_at = new.created_at,
         buyer_last_read_at = case when new.sender_id = c.buyer_id then new.created_at else c.buyer_last_read_at end,
         seller_last_read_at = case when new.sender_id = c.seller_id then new.created_at else c.seller_last_read_at end
   where c.id = new.conversation_id;
  return null;
end;
$$;

create trigger messages_after_insert
  after insert on public.messages
  for each row execute function public.messages_after_insert();

-- Sellers accept or decline offers; buyers can withdraw their own.
create or replace function public.messages_offer_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  convo public.conversations;
begin
  if auth.uid() is null then
    return new; -- service role
  end if;

  if old.kind <> 'offer' or old.offer_status <> 'pending' then
    raise exception 'Only pending offers can be answered';
  end if;
  if new.body is distinct from old.body or new.offer_amount is distinct from old.offer_amount
     or new.sender_id is distinct from old.sender_id or new.kind is distinct from old.kind then
    raise exception 'Messages can''t be edited' using errcode = '42501';
  end if;

  select * into convo from public.conversations where id = old.conversation_id;

  if new.offer_status in ('accepted', 'declined') and auth.uid() <> convo.seller_id then
    raise exception 'Only the seller can accept or decline an offer' using errcode = '42501';
  end if;
  if new.offer_status = 'withdrawn' and auth.uid() <> old.sender_id then
    raise exception 'Only the buyer can withdraw their offer' using errcode = '42501';
  end if;
  if new.offer_status = 'pending' then
    raise exception 'Choose accept, decline or withdraw';
  end if;
  return new;
end;
$$;

create trigger messages_offer_update
  before update on public.messages
  for each row execute function public.messages_offer_update();

create or replace function public.messages_offer_answered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  amount text := to_char(new.offer_amount, 'FM999,999,990');
begin
  if new.offer_status = 'accepted' and old.offer_status = 'pending' then
    insert into public.messages (conversation_id, kind, body)
    values (new.conversation_id, 'system',
            'Offer of ₱' || amount || ' accepted. Agree on payment and meetup or shipping here.');
  elsif new.offer_status = 'declined' and old.offer_status = 'pending' then
    insert into public.messages (conversation_id, kind, body)
    values (new.conversation_id, 'system', 'Offer of ₱' || amount || ' declined.');
  end if;
  return null;
end;
$$;

create trigger messages_offer_answered
  after update of offer_status on public.messages
  for each row execute function public.messages_offer_answered();

-- ---------------------------------------------------------------------------
-- Reports: fill in details, auto-hide listings, track who handled them
-- ---------------------------------------------------------------------------

create or replace function public.reports_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  msg public.messages;
  lst public.listings;
begin
  if tg_op = 'INSERT' then
    new.status := 'open';
    new.handled_by := null;
    new.handled_at := null;
    new.created_at := now();

    if new.message_id is not null then
      select * into msg from public.messages where id = new.message_id;
      -- Only people in the conversation can report its messages.
      if msg.id is null or not exists (
        select 1 from public.conversations c
        where c.id = msg.conversation_id and auth.uid() in (c.buyer_id, c.seller_id)
      ) then
        raise exception 'You can only report messages sent to you' using errcode = '42501';
      end if;
      new.reported_user_id := coalesce(new.reported_user_id, msg.sender_id);
      new.snapshot := left(coalesce(msg.body, '') ||
        case when msg.offer_amount is not null then ' [offer ₱' || msg.offer_amount || ']' else '' end, 2000);
    elsif new.listing_id is not null then
      select * into lst from public.listings where id = new.listing_id;
      new.reported_user_id := coalesce(new.reported_user_id, lst.seller_id);
      new.snapshot := left(lst.title || ' · ₱' || lst.price || coalesce(' · ' || lst.description, ''), 2000);
    end if;

    if new.reported_user_id = auth.uid() then
      raise exception 'You can''t report yourself';
    end if;
  else
    if new.status is distinct from old.status then
      new.handled_by := auth.uid();
      new.handled_at := case when new.status = 'open' then null else now() end;
    end if;
  end if;
  return new;
end;
$$;

create trigger reports_before_write
  before insert or update on public.reports
  for each row execute function public.reports_before_write();

create or replace function public.reports_auto_hide()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.listing_id is not null and (
    select count(distinct r.reporter_id) from public.reports r
    where r.listing_id = new.listing_id and r.status = 'open'
  ) >= 3 then
    update public.listings set hidden_at = now() where id = new.listing_id and hidden_at is null;
  end if;
  return null;
end;
$$;

create trigger reports_auto_hide
  after insert on public.reports
  for each row execute function public.reports_auto_hide();

-- ---------------------------------------------------------------------------
-- Actions the website calls
-- ---------------------------------------------------------------------------

-- Opens (or reopens) the buyer's chat with the seller about a listing.
create or replace function public.start_conversation(p_listing_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  lst public.listings;
  convo_id uuid;
begin
  if me is null then
    raise exception 'Sign in to message sellers' using errcode = '42501';
  end if;

  select id into convo_id from public.conversations where listing_id = p_listing_id and buyer_id = me;
  if convo_id is not null then
    return convo_id;
  end if;

  select * into lst from public.listings where id = p_listing_id;
  if lst.id is null or lst.hidden_at is not null or lst.status not in ('active', 'reserved') then
    raise exception 'This listing is no longer available';
  end if;
  if lst.seller_id = me then
    raise exception 'This is your own listing';
  end if;
  if public.is_blocked_between(me, lst.seller_id) then
    raise exception 'You can''t message this member' using errcode = '42501';
  end if;

  insert into public.conversations (listing_id, buyer_id, seller_id)
  values (lst.id, me, lst.seller_id)
  returning id into convo_id;
  return convo_id;
end;
$$;

create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations
     set buyer_last_read_at = case when buyer_id = auth.uid() then now() else buyer_last_read_at end,
         seller_last_read_at = case when seller_id = auth.uid() then now() else seller_last_read_at end
   where id = p_conversation_id and auth.uid() in (buyer_id, seller_id);
end;
$$;

-- Deletes the signed-in member's account and everything tied to it: profile,
-- binder, listings, chats, vouches, reports and blocks. Finished-sale prices
-- stay for the price guide, without any member details. The website removes
-- the member's listing photos first.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

-- ---------------------------------------------------------------------------
-- Views for the website
-- ---------------------------------------------------------------------------

-- The signed-in member's chats, newest first, with unread counts.
create view public.my_conversations
with (security_invoker = true)
as
select
  c.id,
  c.listing_id,
  c.created_at,
  c.last_message_at,
  case when c.buyer_id = auth.uid() then 'buyer' else 'seller' end as my_role,
  case when c.buyer_id = auth.uid() then c.seller_id else c.buyer_id end as other_id,
  p.display_name as other_name,
  p.username as other_username,
  p.avatar_url as other_avatar,
  coalesce(p.is_verified_seller, false) as other_verified,
  l.title as listing_title,
  l.photos[1] as listing_photo,
  cd.image_small as listing_card_image,
  l.game_id as listing_game_id,
  l.status as listing_status,
  l.price as listing_price,
  lm.kind as last_kind,
  lm.body as last_body,
  lm.offer_amount as last_offer_amount,
  lm.sender_id as last_sender_id,
  (
    select count(*) from public.messages m
    where m.conversation_id = c.id
      and m.sender_id is distinct from auth.uid()
      and m.created_at > case when c.buyer_id = auth.uid() then c.buyer_last_read_at else c.seller_last_read_at end
  )::integer as unread_count
from public.conversations c
left join public.listings l on l.id = c.listing_id
left join public.cards cd on cd.id = l.card_id
left join public.profiles p on p.id = case when c.buyer_id = auth.uid() then c.seller_id else c.buyer_id end
left join lateral (
  select m.kind, m.body, m.offer_amount, m.sender_id
  from public.messages m
  where m.conversation_id = c.id
  order by m.created_at desc
  limit 1
) lm on true
where auth.uid() in (c.buyer_id, c.seller_id);

-- Public trust numbers for a member's profile.
create view public.member_stats
with (security_invoker = true)
as
select
  p.id,
  (select count(*) from public.vouches v where v.subject_id = p.id)::integer as vouch_count,
  (select round(avg(v.rating)::numeric, 1) from public.vouches v where v.subject_id = p.id) as rating_avg,
  (
    select count(*) from public.listings l
    where l.seller_id = p.id and l.status in ('active', 'reserved') and l.hidden_at is null
  )::integer as active_listings,
  (select count(*) from public.listings l where l.seller_id = p.id and l.status = 'sold')::integer as sold_listings
from public.profiles p;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.listings enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.vouches enable row level security;
alter table public.reports enable row level security;
alter table public.blocks enable row level security;
alter table public.sales enable row level security;

create policy "Members browse listings; sellers and mods see all of theirs"
  on public.listings for select to authenticated
  using (
    (hidden_at is null and status in ('active', 'reserved', 'sold'))
    or seller_id = (select auth.uid())
    or (select public.is_mod())
  );

create policy "Discord members can list items"
  on public.listings for insert to authenticated
  with check (
    seller_id = (select auth.uid())
    and (select public.is_guild_member())
    and status = 'active'
    and hidden_at is null
    and buyer_id is null
    and sold_at is null
  );

create policy "Sellers edit their listings"
  on public.listings for update to authenticated
  using (seller_id = (select auth.uid()))
  with check (seller_id = (select auth.uid()));

create policy "Mods moderate listings"
  on public.listings for update to authenticated
  using ((select public.is_mod()))
  with check ((select public.is_mod()));

create policy "Sellers delete their listings"
  on public.listings for delete to authenticated
  using (seller_id = (select auth.uid()));

create policy "People in a chat can see it"
  on public.conversations for select to authenticated
  using ((select auth.uid()) in (buyer_id, seller_id));

create policy "People in a chat can read its messages"
  on public.messages for select to authenticated
  using (exists (
    select 1 from public.conversations c
    where c.id = conversation_id and (select auth.uid()) in (c.buyer_id, c.seller_id)
  ));

create policy "People in a chat can send messages unless blocked"
  on public.messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and kind in ('text', 'offer')
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and (select auth.uid()) in (c.buyer_id, c.seller_id)
        and (kind = 'text' or c.buyer_id = (select auth.uid()))
        and not public.is_blocked_between(c.buyer_id, c.seller_id)
    )
  );

create policy "People in a chat can answer offers"
  on public.messages for update to authenticated
  using (
    kind = 'offer'
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id and (select auth.uid()) in (c.buyer_id, c.seller_id)
    )
  )
  with check (kind = 'offer');

create policy "Members can read vouches"
  on public.vouches for select to authenticated
  using (true);

create policy "Buyers and sellers vouch for each other after a sale"
  on public.vouches for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and exists (
      select 1 from public.listings l
      where l.id = listing_id
        and l.status = 'sold'
        and (
          (l.seller_id = (select auth.uid()) and l.buyer_id = subject_id)
          or (l.buyer_id = (select auth.uid()) and l.seller_id = subject_id)
        )
    )
  );

create policy "Members remove their own vouches"
  on public.vouches for delete to authenticated
  using (author_id = (select auth.uid()));

create policy "Members file reports"
  on public.reports for insert to authenticated
  with check (reporter_id = (select auth.uid()));

create policy "Reporters see their reports; mods see all"
  on public.reports for select to authenticated
  using (reporter_id = (select auth.uid()) or (select public.is_mod()));

create policy "Mods handle reports"
  on public.reports for update to authenticated
  using ((select public.is_mod()))
  with check ((select public.is_mod()));

create policy "Members manage their blocks"
  on public.blocks for select to authenticated
  using (blocker_id = (select auth.uid()));

create policy "Members block others"
  on public.blocks for insert to authenticated
  with check (blocker_id = (select auth.uid()));

create policy "Members unblock others"
  on public.blocks for delete to authenticated
  using (blocker_id = (select auth.uid()));

create policy "Members can read sale prices"
  on public.sales for select to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- Table and function access (least privilege, like the first migration)
-- ---------------------------------------------------------------------------

revoke all on
  public.listings, public.conversations, public.messages, public.vouches,
  public.reports, public.blocks, public.sales, public.my_conversations, public.member_stats
from anon, authenticated;

grant select, insert, update, delete on public.listings to authenticated;
grant select on public.conversations to authenticated;
grant select, insert on public.messages to authenticated;
grant update (offer_status) on public.messages to authenticated;
grant select, insert, delete on public.vouches to authenticated;
grant select, insert on public.reports to authenticated;
grant update (status) on public.reports to authenticated;
grant select, insert, delete on public.blocks to authenticated;
grant select on public.sales to authenticated;
grant select on public.my_conversations, public.member_stats to authenticated;

grant all on
  public.listings, public.conversations, public.messages, public.vouches,
  public.reports, public.blocks, public.sales, public.my_conversations, public.member_stats
to service_role;

revoke execute on function
  public.is_mod(), public.is_guild_member(), public.is_blocked_between(uuid, uuid),
  public.start_conversation(uuid), public.mark_conversation_read(uuid), public.delete_my_account()
from public, anon;

grant execute on function
  public.is_mod(), public.is_guild_member(), public.is_blocked_between(uuid, uuid),
  public.start_conversation(uuid), public.mark_conversation_read(uuid), public.delete_my_account()
to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Live chat updates (Supabase Realtime respects the rules above)
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
    ) then
      alter publication supabase_realtime add table public.messages;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'conversations'
    ) then
      alter publication supabase_realtime add table public.conversations;
    end if;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Listing photos (public to view; members upload only to their own folder)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('listing-photos', 'listing-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "Members upload listing photos to their own folder"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'listing-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Members see their own listing photo files"
  on storage.objects for select to authenticated
  using (bucket_id = 'listing-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Members delete their own listing photos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'listing-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
