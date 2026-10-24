-- Checks catalog review by mods and the server events table. Runs after the
-- earlier tests.
--
-- People:  ...41 member who suggests items   ...42 another member   ...43 mod

insert into auth.users (id, raw_user_meta_data) values
  ('cccccccc-0000-0000-0000-000000000041', '{"name": "suggester"}'),
  ('cccccccc-0000-0000-0000-000000000042', '{"name": "member42"}'),
  ('cccccccc-0000-0000-0000-000000000043', '{"name": "catalogmod"}');
update public.profiles set in_guild = true where id in (
  'cccccccc-0000-0000-0000-000000000041', 'cccccccc-0000-0000-0000-000000000042');
update public.profiles set in_guild = true, is_mod = true where id = 'cccccccc-0000-0000-0000-000000000043';

-- A member suggests items and uses one of them --------------------------------

set role authenticated;
select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000041', false) as _ \gset
insert into public.catalog_items (id, kind, name, brand) values
  ('dddddddd-0000-0000-0000-000000000041', 'toy', 'hot wheels skyline gtr r34', 'Hot weels'),
  ('dddddddd-0000-0000-0000-000000000042', 'toy', 'Skyline GT-R R34 (dupe)', 'Hot Wheels'),
  ('dddddddd-0000-0000-0000-000000000043', 'toy', 'asdfgh', null),
  ('dddddddd-0000-0000-0000-000000000044', 'sealed', 'Prismatic Evolutions ETB', 'Pokémon');
insert into public.collection_items (catalog_item_id, kind, quantity) values
  ('dddddddd-0000-0000-0000-000000000042', 'item', 2);
insert into public.listings (game_id, catalog_item_id, title, kind, price, shipping)
values ('toys', 'dddddddd-0000-0000-0000-000000000042', 'R34 dupe listing', 'item', 350, true);

do $$
begin
  begin
    perform * from public.mod_catalog_queue();
    if exists (select 1 from public.mod_catalog_queue()) then
      raise exception 'members can see the review queue';
    end if;
  end;
  begin
    perform public.mod_save_catalog_item('dddddddd-0000-0000-0000-000000000041', 'Mine now');
    raise exception 'a member approved their own item';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.mod_remove_catalog_item('dddddddd-0000-0000-0000-000000000043');
    raise exception 'a member removed a catalog item';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Another member can't see the pending items.
select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000042', false) as _ \gset
do $$
begin
  if exists (select 1 from public.catalog_items where id = 'dddddddd-0000-0000-0000-000000000041') then
    raise exception 'pending items should be hidden from other members';
  end if;
end $$;

-- The mod reviews -------------------------------------------------------------

select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000043', false) as _ \gset
do $$
declare
  q record;
begin
  if (select count(*) from public.catalog_items where id::text like 'dddddddd-0000-0000-0000-00000000004%') <> 4 then
    raise exception 'mods should see pending items';
  end if;
  select * into q from public.mod_catalog_queue() where id = 'dddddddd-0000-0000-0000-000000000042';
  if q.added_by_name <> 'suggester' or q.in_binders <> 1 or q.in_listings <> 1 then
    raise exception 'queue should show who added it and how it is used: %', row_to_json(q);
  end if;

  -- Fix the name and approve.
  perform public.mod_save_catalog_item('dddddddd-0000-0000-0000-000000000041', '  Skyline GT-R (R34) ', 'Hot Wheels', 'Fast & Furious');
  if (select row(name, brand, line, status)::text from public.catalog_items where id = 'dddddddd-0000-0000-0000-000000000041')
     <> row('Skyline GT-R (R34)', 'Hot Wheels', 'Fast & Furious', 'approved')::text then
    raise exception 'approve did not save the fixed name';
  end if;

  -- Removing an item someone uses is refused; an unused one goes.
  begin
    perform public.mod_remove_catalog_item('dddddddd-0000-0000-0000-000000000042');
    raise exception 'removed an item that is in a binder';
  exception when raise_exception then
    if sqlerrm not like 'Members already use%' then raise; end if;
  end;
  perform public.mod_remove_catalog_item('dddddddd-0000-0000-0000-000000000043');
  if exists (select 1 from public.catalog_items where id = 'dddddddd-0000-0000-0000-000000000043') then
    raise exception 'unused pending item was not removed';
  end if;

  -- Merging needs the same type and an approved target.
  begin
    perform public.mod_merge_catalog_item('dddddddd-0000-0000-0000-000000000044', 'dddddddd-0000-0000-0000-000000000041');
    raise exception 'merged a sealed product into a toy';
  exception when raise_exception then
    if sqlerrm not like 'Both items must be%' then raise; end if;
  end;
  begin
    perform public.mod_merge_catalog_item('dddddddd-0000-0000-0000-000000000041', 'dddddddd-0000-0000-0000-000000000042');
    raise exception 'merged into an item that is not approved';
  exception when raise_exception then
    if sqlerrm <> 'Merge into an approved item' then raise; end if;
  end;

  perform public.mod_merge_catalog_item('dddddddd-0000-0000-0000-000000000042', 'dddddddd-0000-0000-0000-000000000041');
  if (select row(status, merged_into)::text from public.catalog_items where id = 'dddddddd-0000-0000-0000-000000000042')
     <> row('merged', 'dddddddd-0000-0000-0000-000000000041'::uuid)::text then
    raise exception 'duplicate should be marked merged';
  end if;
  if (select catalog_item_id from public.listings where title = 'R34 dupe listing') <> 'dddddddd-0000-0000-0000-000000000041' then
    raise exception 'the listing should move to the right item';
  end if;
end $$;

-- The member's binder moved with the merge.
select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000041', false) as _ \gset
do $$
begin
  if not exists (select 1 from public.collection_items
                 where catalog_item_id = 'dddddddd-0000-0000-0000-000000000041' and quantity = 2) then
    raise exception 'binder entries should move to the merged-into item';
  end if;
end $$;

-- Server events -------------------------------------------------------------

reset role;
set role service_role;
insert into public.community_events (id, name, starts_at, url)
values ('1600000000000000001', 'Pull night', now() + interval '2 days', 'https://discord.com/events/1/1600000000000000001');
reset role;

set role authenticated;
do $$
begin
  if not exists (select 1 from public.community_events where name = 'Pull night') then
    raise exception 'members should see server events';
  end if;
  begin
    insert into public.community_events (id, name, starts_at, url) values ('x', 'Fake', now(), 'https://example.com');
    raise exception 'members can add server events';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

set role anon;
do $$
begin
  begin
    perform 1 from public.community_events;
    raise exception 'signed-out visitors can read server events';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false) as _ \gset

select 'All launch checks passed' as result;
