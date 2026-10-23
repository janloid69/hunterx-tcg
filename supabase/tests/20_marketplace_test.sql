-- Checks the marketplace rules: selling, chats, offers, blocks, sales,
-- vouches, reports, photos and account deletion. Runs after
-- 10_schema_test.sql and reuses its cards. Any failed check stops the run.
--
-- People:  ...01 mod (in the Discord, Mod role)   ...02 seller (in the Discord)
--          ...03 buyer (not in the Discord)       ...04 / ...05 other members

insert into auth.users (id, raw_user_meta_data) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '{"name": "mod"}'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '{"name": "seller"}'),
  ('aaaaaaaa-0000-0000-0000-000000000003', '{"name": "buyer"}'),
  ('aaaaaaaa-0000-0000-0000-000000000004', '{"name": "member4"}'),
  ('aaaaaaaa-0000-0000-0000-000000000005', '{"name": "member5"}');

-- What discord-sync would write.
update public.profiles set in_guild = true, is_mod = true where id = 'aaaaaaaa-0000-0000-0000-000000000001';
update public.profiles set in_guild = true where id = 'aaaaaaaa-0000-0000-0000-000000000002';

-- Only Discord members can sell ----------------------------------------------

set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000003', false) as _ \gset

do $$
begin
  begin
    insert into public.listings (game_id, card_id, title, kind, condition, price, meetup, meetup_area)
    values ('pokemon', 'pokemon:sv8-238', 'Pikachu ex SIR', 'card', 'NM', 1500, true, 'Cubao');
    raise exception 'a member outside the Discord was able to list';
  exception when insufficient_privilege then null;
  end;
end $$;

-- The seller lists, uploads photos --------------------------------------------

select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000002', false) as _ \gset

do $$
declare
  first_id uuid;
  second_id uuid;
begin
  insert into storage.objects (bucket_id, name)
  values ('listing-photos', 'aaaaaaaa-0000-0000-0000-000000000002/l1/front.jpg');
  begin
    insert into storage.objects (bucket_id, name)
    values ('listing-photos', 'aaaaaaaa-0000-0000-0000-000000000003/sneaky.jpg');
    raise exception 'uploaded into another member''s photo folder';
  exception when insufficient_privilege then null;
  end;

  insert into public.listings (game_id, card_id, title, kind, condition, price, meetup, meetup_area,
                               payment_methods, photos)
  values ('pokemon', 'pokemon:sv8-238', 'Pikachu ex SIR', 'card', 'NM', 1500, true, 'Cubao',
          array['GCash', 'Maya'], array['aaaaaaaa-0000-0000-0000-000000000002/l1/front.jpg'])
  returning id into first_id;
  perform set_config('test.listing', first_id::text, false);

  insert into public.listings (game_id, card_id, title, kind, condition, price, shipping)
  values ('one-piece', 'one-piece:OP01-001', 'Roronoa Zoro leader', 'card', 'NM', 3000, true)
  returning id into second_id;
  perform set_config('test.listing2', second_id::text, false);

  begin
    insert into public.listings (game_id, title, kind, price, shipping, photos)
    values ('toys', 'Borrowed photo', 'item', 100, true, array['aaaaaaaa-0000-0000-0000-000000000003/x.jpg']);
    raise exception 'a listing used another member''s photo';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.listings (game_id, title, kind, price) values ('toys', 'No delivery', 'item', 100);
    raise exception 'a listing without meetup or shipping was accepted';
  exception when check_violation then null;
  end;

  begin
    insert into public.listings (game_id, title, kind, price, shipping, payment_methods)
    values ('toys', 'Odd payment', 'item', 100, true, array['Bitcoin']);
    raise exception 'an unknown payment method was accepted';
  exception when check_violation then null;
  end;

  begin
    update public.listings set hidden_at = now() where id = first_id;
    raise exception 'a seller hid a listing (mods only)';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.start_conversation(first_id);
    raise exception 'the seller opened a chat with themselves';
  exception when others then
    if sqlerrm not like 'This is your own listing%' then raise; end if;
  end;
end $$;

-- The buyer (not in the Discord) messages and makes offers -------------------

select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000003', false) as _ \gset

do $$
declare
  listing_id uuid := current_setting('test.listing')::uuid;
  convo uuid;
  again uuid;
begin
  if not exists (select 1 from public.listings where id = listing_id) then
    raise exception 'the buyer can''t see the listing';
  end if;

  convo := public.start_conversation(listing_id);
  again := public.start_conversation(listing_id);
  if convo <> again then raise exception 'messaging twice opened a second chat'; end if;
  perform set_config('test.convo', convo::text, false);

  insert into public.messages (conversation_id, sender_id, body) values (convo, auth.uid(), 'Hi, is this available?');
  insert into public.messages (conversation_id, sender_id, kind, offer_amount) values (convo, auth.uid(), 'offer', 1300);
  insert into public.messages (conversation_id, sender_id, kind, offer_amount) values (convo, auth.uid(), 'offer', 1350);

  if (select offer_status from public.messages where conversation_id = convo and offer_amount = 1300) <> 'pending' then
    raise exception 'new offers should start as pending';
  end if;

  begin
    insert into public.messages (conversation_id, sender_id, kind, body) values (convo, null, 'system', 'Fake');
    raise exception 'a member faked a system message';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.messages (conversation_id, sender_id, body)
    values (convo, 'aaaaaaaa-0000-0000-0000-000000000002', 'Pretending to be the seller');
    raise exception 'a member sent a message as someone else';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.messages set body = 'Edited' where conversation_id = convo;
    raise exception 'a message was edited';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.messages set offer_status = 'accepted' where conversation_id = convo and offer_amount = 1300;
    raise exception 'the buyer accepted their own offer';
  exception when insufficient_privilege then null;
  end;

  update public.messages set offer_status = 'withdrawn' where conversation_id = convo and offer_amount = 1350;
end $$;

-- Someone outside the chat sees nothing ---------------------------------------

select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000004', false) as _ \gset

do $$
declare
  convo uuid := current_setting('test.convo')::uuid;
begin
  if exists (select 1 from public.conversations where id = convo) then raise exception 'outsider sees the chat'; end if;
  if exists (select 1 from public.messages where conversation_id = convo) then raise exception 'outsider reads messages'; end if;
  if exists (select 1 from public.my_conversations) then raise exception 'outsider has chats listed'; end if;
  begin
    insert into public.messages (conversation_id, sender_id, body) values (convo, auth.uid(), 'Spam');
    raise exception 'outsider posted into the chat';
  exception when insufficient_privilege then null;
  end;
end $$;

-- The seller reads, accepts an offer, replies ---------------------------------

select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000002', false) as _ \gset

do $$
declare
  convo uuid := current_setting('test.convo')::uuid;
  unread integer;
begin
  select unread_count into unread from public.my_conversations where id = convo;
  if unread <> 3 then raise exception 'seller should have 3 unread messages, got %', unread; end if;

  perform public.mark_conversation_read(convo);
  select unread_count into unread from public.my_conversations where id = convo;
  if unread <> 0 then raise exception 'unread count did not reset, got %', unread; end if;

  update public.messages set offer_status = 'accepted' where conversation_id = convo and offer_amount = 1300;
  if not exists (
    select 1 from public.messages
    where conversation_id = convo and kind = 'system' and body like 'Offer of ₱1,300 accepted%'
  ) then
    raise exception 'accepting an offer did not post a note in the chat';
  end if;

  begin
    update public.messages set offer_status = 'accepted' where conversation_id = convo and offer_amount = 1350;
    raise exception 'a withdrawn offer was accepted';
  exception when others then
    if sqlerrm not like 'Only pending offers%' then raise; end if;
  end;

  begin
    insert into public.messages (conversation_id, sender_id, kind, offer_amount) values (convo, auth.uid(), 'offer', 900);
    raise exception 'the seller made an offer on their own listing';
  exception when insufficient_privilege then null;
  end;

  insert into public.messages (conversation_id, sender_id, body) values (convo, auth.uid(), 'Sure, deal!');
end $$;

-- Blocking stops messages both ways -------------------------------------------

insert into public.blocks (blocked_id) values ('aaaaaaaa-0000-0000-0000-000000000003');

select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000003', false) as _ \gset

do $$
declare
  convo uuid := current_setting('test.convo')::uuid;
begin
  begin
    insert into public.messages (conversation_id, sender_id, body) values (convo, auth.uid(), 'Hello?');
    raise exception 'a blocked member could still message';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.start_conversation(current_setting('test.listing2')::uuid);
    raise exception 'a blocked member opened a new chat';
  exception when insufficient_privilege then null;
  end;

  if (select count(*) from public.messages where conversation_id = convo) <> 5 then
    raise exception 'chat history should stay readable after a block';
  end if;
  if exists (select 1 from public.blocks) then raise exception 'members can see blocks made by others'; end if;
  if public.is_blocked_between('aaaaaaaa-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000005') then
    raise exception 'block lookups answered for other people';
  end if;
end $$;

select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000002', false) as _ \gset
delete from public.blocks where blocked_id = 'aaaaaaaa-0000-0000-0000-000000000003';

-- Marking sold records the sale -----------------------------------------------

do $$
declare
  listing_id uuid := current_setting('test.listing')::uuid;
  sale public.sales;
begin
  begin
    update public.listings set status = 'sold', buyer_id = 'aaaaaaaa-0000-0000-0000-000000000004'
    where id = listing_id;
    raise exception 'sold to someone who never messaged';
  exception when others then
    if sqlerrm not like 'The buyer must be%' then raise; end if;
  end;

  update public.listings set status = 'sold', buyer_id = 'aaaaaaaa-0000-0000-0000-000000000003', sold_price = 1300
  where id = listing_id;

  select * into sale from public.sales where sales.listing_id = current_setting('test.listing')::uuid;
  if sale.price <> 1300 then raise exception 'sale price should be 1300, got %', sale.price; end if;
  if sale.card_id <> 'pokemon:sv8-238' then raise exception 'sale is missing its card'; end if;
  if (select sold_at from public.listings where id = listing_id) is null then raise exception 'sold_at not set'; end if;
end $$;

-- Vouches only between the buyer and seller of a sold listing ----------------

select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000003', false) as _ \gset

do $$
begin
  insert into public.vouches (listing_id, subject_id, rating, comment)
  values (current_setting('test.listing')::uuid, 'aaaaaaaa-0000-0000-0000-000000000002', 5, 'Smooth deal!');

  begin
    insert into public.vouches (listing_id, subject_id, rating)
    values (current_setting('test.listing')::uuid, 'aaaaaaaa-0000-0000-0000-000000000002', 5);
    raise exception 'vouched twice for one deal';
  exception when unique_violation then null;
  end;

  begin
    insert into public.vouches (listing_id, subject_id, rating)
    values (current_setting('test.listing2')::uuid, 'aaaaaaaa-0000-0000-0000-000000000002', 5);
    raise exception 'vouched without a sale';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000004', false) as _ \gset

do $$
declare
  stats public.member_stats;
begin
  begin
    insert into public.vouches (listing_id, subject_id, rating)
    values (current_setting('test.listing')::uuid, 'aaaaaaaa-0000-0000-0000-000000000002', 1);
    raise exception 'someone outside the deal left a vouch';
  exception when insufficient_privilege then null;
  end;

  select * into stats from public.member_stats where id = 'aaaaaaaa-0000-0000-0000-000000000002';
  if stats.vouch_count <> 1 or stats.rating_avg <> 5.0 then
    raise exception 'seller stats wrong: % vouches, % rating', stats.vouch_count, stats.rating_avg;
  end if;
  if stats.sold_listings <> 1 or stats.active_listings <> 1 then
    raise exception 'seller listing counts wrong: % sold, % active', stats.sold_listings, stats.active_listings;
  end if;
end $$;

-- Reports: three members hide a listing until a mod reviews it ---------------

select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000003', false) as _ \gset

do $$
declare
  seller_message uuid;
  report public.reports;
begin
  insert into public.reports (listing_id, reason) values (current_setting('test.listing2')::uuid, 'fake');

  select id into seller_message from public.messages
  where conversation_id = current_setting('test.convo')::uuid and body = 'Sure, deal!';
  insert into public.reports (message_id, reason, details) values (seller_message, 'harassment', 'Test report')
  returning * into report;
  if report.reported_user_id <> 'aaaaaaaa-0000-0000-0000-000000000002' or report.snapshot <> 'Sure, deal!' then
    raise exception 'message report did not capture the sender and text';
  end if;
  perform set_config('test.message', seller_message::text, false);
end $$;

select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000004', false) as _ \gset

do $$
declare
  changed integer;
begin
  insert into public.reports (listing_id, reason) values (current_setting('test.listing2')::uuid, 'scam');
  if not exists (select 1 from public.listings where id = current_setting('test.listing2')::uuid) then
    raise exception 'two reports should not hide a listing';
  end if;

  begin
    insert into public.reports (message_id, reason) values (current_setting('test.message')::uuid, 'spam');
    raise exception 'reported a message from a chat they are not in';
  exception when insufficient_privilege then null;
  end;

  update public.reports set status = 'resolved';
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'a regular member resolved a report'; end if;
end $$;

select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000005', false) as _ \gset

do $$
begin
  insert into public.reports (listing_id, reason) values (current_setting('test.listing2')::uuid, 'scam');
  if exists (select 1 from public.listings where id = current_setting('test.listing2')::uuid) then
    raise exception 'three reports should hide the listing';
  end if;
  if (select count(*) from public.reports) <> 1 then raise exception 'members should only see their own reports'; end if;
end $$;

select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000002', false) as _ \gset

do $$
begin
  if not exists (select 1 from public.listings where id = current_setting('test.listing2')::uuid) then
    raise exception 'sellers should still see their hidden listing';
  end if;
  begin
    update public.listings set hidden_at = null where id = current_setting('test.listing2')::uuid;
    raise exception 'a seller un-hid their own reported listing';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.reports (listing_id, reason) values (current_setting('test.listing2')::uuid, 'other');
    raise exception 'a seller reported their own listing';
  exception when others then
    if sqlerrm not like 'You can''t report yourself%' then raise; end if;
  end;
end $$;

select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false) as _ \gset

do $$
declare
  report public.reports;
begin
  if (select count(*) from public.reports) <> 4 then raise exception 'mods should see every report'; end if;

  update public.reports set status = 'dismissed'
  where listing_id = current_setting('test.listing2')::uuid and reason = 'fake'
  returning * into report;
  if report.handled_by <> 'aaaaaaaa-0000-0000-0000-000000000001' or report.handled_at is null then
    raise exception 'handling a report should record the mod and time';
  end if;

  update public.listings set hidden_at = null where id = current_setting('test.listing2')::uuid;
end $$;

select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000005', false) as _ \gset

do $$
begin
  if not exists (select 1 from public.listings where id = current_setting('test.listing2')::uuid) then
    raise exception 'a listing restored by a mod should be visible again';
  end if;
end $$;

reset role;

-- Visitors who aren't signed in see nothing -----------------------------------

set role anon;
select set_config('request.jwt.claim.sub', '', false) as _ \gset

do $$
declare
  seen integer;
begin
  begin
    select count(*) into seen from public.listings;
    if seen <> 0 then raise exception 'visitors can see listings'; end if;
  exception when insufficient_privilege then null;
  end;
  begin
    select count(*) into seen from public.messages;
    if seen <> 0 then raise exception 'visitors can read messages'; end if;
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.start_conversation(current_setting('test.listing2')::uuid);
    raise exception 'a visitor opened a chat';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;

-- Deleting an account removes the member's data but keeps sale prices ---------

set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000003', false) as _ \gset
select public.delete_my_account();
reset role;

do $$
begin
  if exists (select 1 from auth.users where id = 'aaaaaaaa-0000-0000-0000-000000000003') then
    raise exception 'account still exists';
  end if;
  if exists (select 1 from public.profiles where id = 'aaaaaaaa-0000-0000-0000-000000000003') then
    raise exception 'profile survived account deletion';
  end if;
  if exists (select 1 from public.conversations where buyer_id = 'aaaaaaaa-0000-0000-0000-000000000003') then
    raise exception 'chats survived account deletion';
  end if;
  if exists (select 1 from public.vouches where author_id = 'aaaaaaaa-0000-0000-0000-000000000003') then
    raise exception 'vouches survived account deletion';
  end if;
  if (select buyer_id from public.listings where id = current_setting('test.listing')::uuid) is not null then
    raise exception 'sold listing still points at the deleted buyer';
  end if;
  if not exists (select 1 from public.sales where card_id = 'pokemon:sv8-238' and price = 1300) then
    raise exception 'the sale price should stay for the price guide';
  end if;
end $$;

select 'All marketplace checks passed' as result;
