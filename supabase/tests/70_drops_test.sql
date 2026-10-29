-- Checks the upcoming drops table: the bot writes, Verified Sellers and mods
-- read, nobody else.

set role service_role;
insert into public.community_drops (id, author_name, content, attachments, reply, posted_at, url)
values ('1600000000000000001', 'benzonnn', '@Pokemon queue up', '[{"url": "https://cdn.discordapp.com/x.png", "kind": "image"}]',
        '{"author": "benzonnn", "content": "earlier post"}', now(), 'https://discord.com/channels/1/2/1600000000000000001');
reset role;

insert into auth.users (id, raw_user_meta_data) values
  ('cccccccc-0000-0000-0000-000000000071', '{"name": "circleseller"}'),
  ('cccccccc-0000-0000-0000-000000000072', '{"name": "plainmember"}'),
  ('cccccccc-0000-0000-0000-000000000073', '{"name": "dropmod"}');
update public.profiles set in_guild = true, is_verified_seller = true where id = 'cccccccc-0000-0000-0000-000000000071';
update public.profiles set in_guild = true where id = 'cccccccc-0000-0000-0000-000000000072';
update public.profiles set in_guild = true, is_mod = true where id = 'cccccccc-0000-0000-0000-000000000073';

set role authenticated;

-- A member without the hunterxcircle role sees no drops (and no error).
select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000072', false) as _ \gset
do $$
begin
  if exists (select 1 from public.community_drops) or public.can_see_drops() then
    raise exception 'members without Verified Seller should not see drops';
  end if;
end $$;

-- Mods see them.
select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000073', false) as _ \gset
do $$
begin
  if not exists (select 1 from public.community_drops) then
    raise exception 'mods should see drops';
  end if;
end $$;

-- Verified Sellers see them, and still can't change them.
select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000071', false) as _ \gset
do $$
begin
  if (select attachments -> 0 ->> 'kind' from public.community_drops where id = '1600000000000000001') is distinct from 'image' then
    raise exception 'Verified Sellers should see drops with their pictures';
  end if;
  begin
    insert into public.community_drops (id, author_name, posted_at, url) values ('x', 'Fake', now(), 'https://example.com');
    raise exception 'members can add drops';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.community_drops;
    raise exception 'members can delete drops';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

set role anon;
do $$
begin
  begin
    perform 1 from public.community_drops;
    raise exception 'signed-out visitors can read drops';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false) as _ \gset

select 'All drops checks passed' as result;
