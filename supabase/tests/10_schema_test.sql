-- Checks the schema and its row-level security. Run after the stub and the
-- migration with: psql -v ON_ERROR_STOP=1 -f <file>. Any failed check raises
-- an exception and stops the run.

\set kiluwa '11111111-1111-1111-1111-111111111111'
\set other '22222222-2222-2222-2222-222222222222'

-- New Discord sign-ins get a profile automatically -------------------------

insert into auth.users (id, raw_user_meta_data) values
  (:'kiluwa', '{"provider_id": "123456789", "name": "kiluwathegreat", "full_name": "kiluwathegreat",
              "avatar_url": "https://cdn.discordapp.com/avatars/1/a.png",
              "custom_claims": {"global_name": "Kiluwa"}}'),
  (:'other', '{}');

do $$
declare p public.profiles;
begin
  select * into p from public.profiles where id = '11111111-1111-1111-1111-111111111111';
  if p.id is null then raise exception 'profile was not created on sign-up'; end if;
  if p.discord_id <> '123456789' then raise exception 'discord_id not copied: %', p.discord_id; end if;
  if p.display_name <> 'Kiluwa' then raise exception 'display_name not taken from global_name: %', p.display_name; end if;
  if p.is_verified_seller then raise exception 'new members must not start as verified sellers'; end if;
  if (select count(*) from public.profiles) <> 2 then raise exception 'expected 2 profiles'; end if;
end $$;

-- Reference data, written the way the card sync does (service role) ---------

set role service_role;

insert into public.card_sets (id, game_id, code, name, series, release_date, card_count, source) values
  ('pokemon:sv8', 'pokemon', 'SSP', 'Surging Sparks', 'Scarlet & Violet', '2024-11-08', 3, 'pokemontcg.io'),
  ('one-piece:OP-01', 'one-piece', 'OP-01', 'Romance Dawn', null, null, 2, 'optcgapi.com');

insert into public.cards (id, game_id, set_id, number, sort_number, name, rarity, source) values
  ('pokemon:sv8-1', 'pokemon', 'pokemon:sv8', '1', 1, 'Exeggcute', 'Common', 'pokemontcg.io'),
  ('pokemon:sv8-2', 'pokemon', 'pokemon:sv8', '2', 2, 'Exeggutor', 'Uncommon', 'pokemontcg.io'),
  ('pokemon:sv8-238', 'pokemon', 'pokemon:sv8', '238', 238, 'Pikachu ex', 'Special Illustration Rare', 'pokemontcg.io'),
  ('one-piece:OP01-001', 'one-piece', 'one-piece:OP-01', 'OP01-001', 1, 'Roronoa Zoro', 'L', 'optcgapi.com'),
  ('one-piece:OP01-002', 'one-piece', 'one-piece:OP-01', 'OP01-002', 2, 'Trafalgar Law', 'L', 'optcgapi.com');

reset role;

-- Member 1 builds a binder ---------------------------------------------------

set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false) as _jwt_sub \gset

insert into public.collection_items (card_id, kind, quantity, condition, price_paid)
values ('pokemon:sv8-1', 'card', 2, 'NM', 20), ('pokemon:sv8-238', 'card', 1, 'NM', 12000);

insert into public.collection_items (card_id, kind, quantity, grader, grade)
values ('pokemon:sv8-238', 'graded', 1, 'PSA', 10);

insert into public.catalog_items (id, kind, name, brand, line)
values ('33333333-3333-3333-3333-333333333333', 'toy', 'Porsche 930 Turbo', 'Hot Wheels', 'Red Line Club');

insert into public.collection_items (catalog_item_id, kind, quantity, condition, price_paid)
values ('33333333-3333-3333-3333-333333333333', 'item', 1, 'NM', 6200);

do $$
declare
  progress record;
  changed integer;
begin
  select * into progress from public.my_set_progress where set_id = 'pokemon:sv8';
  if progress.owned_cards <> 2 then raise exception 'expected 2 owned cards in sv8, got %', progress.owned_cards; end if;
  if progress.total_cards <> 3 then raise exception 'expected 3 total cards, got %', progress.total_cards; end if;
  if progress.copies <> 4 then raise exception 'expected 4 copies, got %', progress.copies; end if;

  if (select count(*) from public.collection_items) <> 4 then
    raise exception 'member should see their 4 binder entries';
  end if;

  -- Members cannot give themselves the Verified Seller badge
  update public.profiles set is_verified_seller = true
  where id = '11111111-1111-1111-1111-111111111111';
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'members must not be able to edit profile badges'; end if;

  -- A graded slab needs a grader and a grade
  begin
    insert into public.collection_items (card_id, kind, quantity) values ('pokemon:sv8-2', 'graded', 1);
    raise exception 'graded entry without a grade was accepted';
  exception when check_violation then null;
  end;

  -- Cards must point at a card, toys at a catalog item
  begin
    insert into public.collection_items (catalog_item_id, kind, quantity)
    values ('33333333-3333-3333-3333-333333333333', 'card', 1);
    raise exception 'card entry pointing at a catalog item was accepted';
  exception when check_violation then null;
  end;

  -- Members cannot approve their own catalog suggestions
  begin
    insert into public.catalog_items (kind, name, status) values ('toy', 'Self-approved item', 'approved');
    raise exception 'member was able to insert an approved catalog item';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Member 2 cannot see or touch member 1's binder ----------------------------

select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false) as _jwt_sub \gset

do $$
declare changed integer;
begin
  if (select count(*) from public.collection_items) <> 0 then
    raise exception 'member 2 can see member 1''s binder';
  end if;
  if (select count(*) from public.my_set_progress) <> 0 then
    raise exception 'member 2 can see member 1''s set progress';
  end if;
  if (select count(*) from public.catalog_items) <> 0 then
    raise exception 'member 2 can see member 1''s pending catalog item';
  end if;

  update public.collection_items set quantity = 99;
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'member 2 edited member 1''s binder'; end if;

  delete from public.collection_items;
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'member 2 deleted member 1''s binder'; end if;

  begin
    insert into public.collection_items (user_id, card_id, kind, quantity)
    values ('11111111-1111-1111-1111-111111111111', 'pokemon:sv8-2', 'card', 1);
    raise exception 'member 2 added to member 1''s binder';
  exception when insufficient_privilege then null;
  end;

  if (select count(*) from public.profiles) <> 2 then
    raise exception 'members should see member profiles';
  end if;
end $$;

reset role;

-- Visitors who are not signed in -------------------------------------------

set role anon;
select set_config('request.jwt.claim.sub', '', false) as _jwt_sub \gset

do $$
begin
  if (select count(*) from public.cards) <> 5 then raise exception 'visitors should be able to read cards'; end if;
  if (select count(*) from public.collection_items) <> 0 then raise exception 'visitors can see binders'; end if;
  if (select count(*) from public.profiles) <> 0 then raise exception 'visitors can see profiles'; end if;
end $$;

reset role;

-- Deleting an account removes the member's data -----------------------------

delete from auth.users where id = '11111111-1111-1111-1111-111111111111';

do $$
begin
  if exists (select 1 from public.profiles where id = '11111111-1111-1111-1111-111111111111') then
    raise exception 'profile survived account deletion';
  end if;
  if exists (select 1 from public.collection_items where user_id = '11111111-1111-1111-1111-111111111111') then
    raise exception 'binder survived account deletion';
  end if;
end $$;

select 'All schema checks passed' as result;
