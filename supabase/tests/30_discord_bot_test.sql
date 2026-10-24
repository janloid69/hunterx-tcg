-- Checks the Discord bot's tables and functions: events from website actions,
-- claiming and retrying events, role sync, mod buttons, DM setting, and that
-- nobody but the secret key can reach any of it. Runs after
-- 20_marketplace_test.sql. Any failed check stops the run.
--
-- People:  ...11 seller (Discord d11)   ...12 buyer (d12, not in the server)
--          ...13 mod (d13)              ...14 / ...15 reporters (d14, d15)

insert into auth.users (id, raw_user_meta_data) values
  ('bbbbbbbb-0000-0000-0000-000000000011', '{"name": "seller", "provider_id": "d11"}'),
  ('bbbbbbbb-0000-0000-0000-000000000012', '{"name": "buyer", "provider_id": "d12"}'),
  ('bbbbbbbb-0000-0000-0000-000000000013', '{"name": "mod", "provider_id": "d13"}'),
  ('bbbbbbbb-0000-0000-0000-000000000014', '{"name": "r14", "provider_id": "d14"}'),
  ('bbbbbbbb-0000-0000-0000-000000000015', '{"name": "r15", "provider_id": "d15"}');

-- Nobody but the secret key can reach the bot's things ------------------------

set role anon;
do $$
begin
  begin
    perform 1 from public.bot_outbox;
    raise exception 'anon can read bot_outbox';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000012', false) as _ \gset
do $$
begin
  begin
    perform 1 from public.bot_outbox;
    raise exception 'members can read bot_outbox';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.bot_discord_posts;
    raise exception 'members can read bot_discord_posts';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.bot_next_events(5);
    raise exception 'members can claim bot events';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.bot_sync_roles('[{"id": "d12", "roles": ["circle", "mod"]}]', '{}', false, 'circle', 'mod');
    raise exception 'members can give themselves roles';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.bot_moderate('d12', gen_random_uuid(), 'resolve');
    raise exception 'members can use the mod buttons function';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.bot_enqueue('listing', gen_random_uuid(), 'created');
    raise exception 'members can write bot events';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.bot_finish_event(1);
    raise exception 'members can finish bot events';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Members turn DMs off for themselves only.
select public.set_discord_dms(false);
reset role;

do $$
begin
  if (select discord_dms from public.profiles where id = 'bbbbbbbb-0000-0000-0000-000000000012') then
    raise exception 'set_discord_dms did not turn DMs off';
  end if;
  if not (select discord_dms from public.profiles where id = 'bbbbbbbb-0000-0000-0000-000000000011') then
    raise exception 'DMs should be on by default';
  end if;
end $$;

-- Role sync ---------------------------------------------------------------

set role service_role;
do $$
declare
  changed integer;
begin
  changed := public.bot_sync_roles(
    '[{"id": "d11", "roles": ["circle"]}, {"id": "d13", "roles": ["mod"]},
      {"id": "d14", "roles": []}, {"id": "d15", "roles": []}, {"id": "nobody", "roles": ["mod"]}]',
    '{}', false, 'circle', 'mod');
  if changed <> 4 then
    raise exception 'expected 4 profiles changed, got %', changed;
  end if;
  if not exists (select 1 from public.profiles where discord_id = 'd11' and in_guild and is_verified_seller and not is_mod) then
    raise exception 'd11 should be a Verified Seller';
  end if;
  if not exists (select 1 from public.profiles where discord_id = 'd13' and in_guild and is_mod and not is_verified_seller) then
    raise exception 'd13 should be a mod';
  end if;
  if public.bot_sync_roles('[{"id": "d11", "roles": ["circle"]}]', '{}', false, 'circle', 'mod') <> 0 then
    raise exception 'syncing the same roles again should change nothing';
  end if;

  -- Circle subscription ends: role removed.
  perform public.bot_sync_roles('[{"id": "d11", "roles": []}]', '{}', false, 'circle', 'mod');
  if exists (select 1 from public.profiles where discord_id = 'd11' and is_verified_seller) then
    raise exception 'Verified Seller should go when the circle role goes';
  end if;

  -- Leaves the server.
  perform public.bot_sync_roles('[]', array['d14'], false, 'circle', 'mod');
  if exists (select 1 from public.profiles where discord_id = 'd14' and in_guild) then
    raise exception 'd14 left the server but is still in_guild';
  end if;

  begin
    perform public.bot_sync_roles('[]', '{}', true, 'circle', 'mod');
    raise exception 'a full sync with no members should be refused';
  exception when raise_exception then
    if sqlerrm not like 'A full sync%' then raise; end if;
  end;

  -- Full sync: everyone listed stays, d15 (missing) is out.
  perform public.bot_sync_roles(
    '[{"id": "d11", "roles": ["circle"]}, {"id": "d13", "roles": ["mod"]}]', '{}', true, 'circle', 'mod');
  if exists (select 1 from public.profiles where discord_id = 'd15' and in_guild) then
    raise exception 'full sync should mark missing members as out of the server';
  end if;
  if not exists (select 1 from public.profiles where discord_id = 'd11' and in_guild and is_verified_seller) then
    raise exception 'full sync dropped d11';
  end if;
end $$;
reset role;

-- Website actions create events -------------------------------------------

update public.profiles set in_guild = true where discord_id in ('d14', 'd15');
delete from public.bot_outbox;

set role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000011', false) as _ \gset
do $$
declare
  listing_id uuid;
begin
  insert into public.listings (game_id, card_id, title, kind, condition, price, meetup, meetup_area)
  values ('one-piece', 'one-piece:OP01-001', 'Zoro leader for the bot', 'card', 'NM', 900, true, 'Cubao')
  returning id into listing_id;
  perform set_config('test.bot_listing', listing_id::text, false);
  update public.listings set price = 850 where id = listing_id;
  update public.listings set price = 800 where id = listing_id;
  -- updated_at alone is not news
  update public.listings set updated_at = now() where id = listing_id;
end $$;
reset role;

do $$
begin
  if (select count(*) from public.bot_outbox where kind = 'listing' and ref_id = current_setting('test.bot_listing')::uuid) <> 1 then
    raise exception 'a new listing plus edits before the bot runs should be one event';
  end if;
end $$;

-- The bot claims it; a later edit is a new event.
set role service_role;
do $$
declare
  claimed integer;
  first_id bigint;
begin
  select count(*), min(id) into claimed, first_id from public.bot_next_events(10);
  if claimed <> 1 then
    raise exception 'expected 1 event to claim, got %', claimed;
  end if;
  if (select count(*) from public.bot_next_events(10)) <> 0 then
    raise exception 'claimed events should not be handed out twice';
  end if;
  perform set_config('test.first_event', first_id::text, false);
end $$;
reset role;

update public.listings set price = 750 where id = current_setting('test.bot_listing')::uuid;

do $$
begin
  if (select count(*) from public.bot_outbox
      where kind = 'listing' and ref_id = current_setting('test.bot_listing')::uuid and processed_at is null) <> 2 then
    raise exception 'an edit while the bot is busy should queue a new event';
  end if;
end $$;

set role service_role;
do $$
declare
  ev public.bot_outbox;
begin
  perform public.bot_finish_event(current_setting('test.first_event')::bigint);
  if (select processed_at from public.bot_outbox where id = current_setting('test.first_event')::bigint) is null then
    raise exception 'finished event has no processed_at';
  end if;

  select * into ev from public.bot_next_events(10) limit 1;
  perform public.bot_finish_event(ev.id, 'Discord said no');
  select * into ev from public.bot_outbox where id = ev.id;
  if ev.processed_at is not null or ev.claimed_at is not null or ev.last_error <> 'Discord said no'
     or ev.available_at <= now() then
    raise exception 'a failed event should wait and retry: %', row_to_json(ev);
  end if;
  if exists (select 1 from public.bot_next_events(10)) then
    raise exception 'an event waiting to retry was handed out early';
  end if;
  update public.bot_outbox set processed_at = now() where id = ev.id;
end $$;
reset role;

-- Messages wait a minute; system messages and edits don't DM anyone.
set role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000012', false) as _ \gset
do $$
declare
  convo uuid;
  offer_id uuid;
begin
  convo := public.start_conversation(current_setting('test.bot_listing')::uuid);
  perform set_config('test.bot_convo', convo::text, false);
  insert into public.messages (conversation_id, sender_id, kind, body)
  values (convo, auth.uid(), 'text', 'Available pa?');
  insert into public.messages (conversation_id, sender_id, kind, body, offer_amount)
  values (convo, auth.uid(), 'offer', 'Last na?', 600)
  returning id into offer_id;
  perform set_config('test.bot_offer', offer_id::text, false);
end $$;

select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000011', false) as _ \gset
update public.messages set offer_status = 'accepted' where id = current_setting('test.bot_offer')::uuid;
reset role;

do $$
begin
  if (select count(*) from public.bot_outbox where kind = 'message' and processed_at is null) <> 2 then
    raise exception 'expected 2 message events (text and offer, not the system note)';
  end if;
  if exists (select 1 from public.bot_outbox where kind = 'message' and available_at < now() + interval '50 seconds') then
    raise exception 'message events should wait about a minute';
  end if;
  if not exists (select 1 from public.bot_outbox where kind = 'offer' and ref_id = current_setting('test.bot_offer')::uuid) then
    raise exception 'accepting an offer should create an offer event';
  end if;
end $$;

-- Sale, vouch, reports.
set role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000011', false) as _ \gset
update public.listings set status = 'sold', buyer_id = 'bbbbbbbb-0000-0000-0000-000000000012', sold_price = 600
 where id = current_setting('test.bot_listing')::uuid;
insert into public.vouches (listing_id, subject_id, rating, comment)
values (current_setting('test.bot_listing')::uuid, 'bbbbbbbb-0000-0000-0000-000000000012', 5, 'Smooth deal');

select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000014', false) as _ \gset
do $$
declare
  report_id uuid;
begin
  insert into public.reports (listing_id, reason, details)
  values (current_setting('test.bot_listing')::uuid, 'fake', 'Looks like a proxy')
  returning id into report_id;
  perform set_config('test.bot_report', report_id::text, false);
end $$;
reset role;

do $$
begin
  if not exists (select 1 from public.bot_outbox where kind = 'vouch') then
    raise exception 'a vouch should create an event';
  end if;
  if not exists (select 1 from public.bot_outbox where kind = 'report' and ref_id = current_setting('test.bot_report')::uuid and event = 'created') then
    raise exception 'a report should create an event';
  end if;
end $$;

-- Mod buttons --------------------------------------------------------------

update public.bot_outbox set processed_at = now() where processed_at is null;

-- The bot's calls carry no member sign-in.
select set_config('request.jwt.claim.sub', '', false) as _ \gset
set role service_role;
do $$
begin
  begin
    perform public.bot_moderate('d14', current_setting('test.bot_report')::uuid, 'resolve');
    raise exception 'a non-mod used the mod buttons';
  exception when insufficient_privilege then null;
  end;

  perform public.bot_moderate('d13', current_setting('test.bot_report')::uuid, 'hide');
  if (select hidden_at from public.listings where id = current_setting('test.bot_listing')::uuid) is null then
    raise exception 'hide button did not hide the listing';
  end if;

  perform public.bot_moderate('d13', current_setting('test.bot_report')::uuid, 'resolve');
  if (select status from public.reports where id = current_setting('test.bot_report')::uuid) <> 'resolved' then
    raise exception 'resolve button did not resolve the report';
  end if;
  if (select handled_by from public.reports where id = current_setting('test.bot_report')::uuid)
     is distinct from 'bbbbbbbb-0000-0000-0000-000000000013'::uuid then
    raise exception 'the report should record the mod who pressed the button';
  end if;

  perform public.bot_moderate('d13', current_setting('test.bot_report')::uuid, 'restore');
  if (select hidden_at from public.listings where id = current_setting('test.bot_listing')::uuid) is not null then
    raise exception 'restore button did not bring the listing back';
  end if;

  begin
    perform public.bot_moderate('d13', current_setting('test.bot_report')::uuid, 'ban everyone');
    raise exception 'an unknown action was accepted';
  exception when raise_exception then
    if sqlerrm not like 'Unknown action%' then raise; end if;
  end;
end $$;

-- Acting as the mod lasts only for that one call.
do $$
begin
  if auth.uid() is not null then
    raise exception 'bot_moderate left the mod signed in: %', auth.uid();
  end if;
end $$;
reset role;

do $$
begin
  if (select count(*) from public.bot_outbox where kind = 'report' and processed_at is null) < 1 then
    raise exception 'hiding a reported listing or resolving should update the ticket';
  end if;
  if not exists (select 1 from public.bot_outbox where kind = 'listing' and event = 'updated' and processed_at is null) then
    raise exception 'hiding a listing should update its market post';
  end if;
end $$;

-- Deleting a listing always queues a delete, even with other events waiting.
delete from public.listings where id = current_setting('test.bot_listing')::uuid;
do $$
begin
  if not exists (select 1 from public.bot_outbox where kind = 'listing' and event = 'deleted'
                 and ref_id = current_setting('test.bot_listing')::uuid) then
    raise exception 'deleting a listing should queue a delete for its market post';
  end if;
end $$;

-- Cleanup drops old finished events only.
insert into public.bot_outbox (kind, ref_id, event, processed_at, created_at)
values ('vouch', gen_random_uuid(), 'created', now() - interval '20 days', now() - interval '20 days');

set role service_role;
do $$
declare
  before integer;
begin
  select count(*) into before from public.bot_outbox;
  if public.bot_cleanup() <> 1 then
    raise exception 'cleanup should remove exactly the old finished event';
  end if;
  if (select count(*) from public.bot_outbox) <> before - 1 then
    raise exception 'cleanup removed the wrong rows';
  end if;
end $$;
reset role;

select 'All Discord bot checks passed' as result;
