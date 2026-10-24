-- Checks the peso price guide: global prices from the card sync, logging sales,
-- the HunterX median, removing logged sales, binder value, and who can see
-- what. Runs after the earlier tests (uses the sample cards from 10_schema_test).
--
-- People:  ...31 member in the Discord   ...32 another member in the Discord
--          ...33 not in the Discord      ...34 mod

insert into auth.users (id, raw_user_meta_data) values
  ('cccccccc-0000-0000-0000-000000000031', '{"name": "logger"}'),
  ('cccccccc-0000-0000-0000-000000000032', '{"name": "other"}'),
  ('cccccccc-0000-0000-0000-000000000033', '{"name": "outsider"}'),
  ('cccccccc-0000-0000-0000-000000000034', '{"name": "pricemod"}');

update public.profiles set in_guild = true where id in (
  'cccccccc-0000-0000-0000-000000000031', 'cccccccc-0000-0000-0000-000000000032');
update public.profiles set in_guild = true, is_mod = true where id = 'cccccccc-0000-0000-0000-000000000034';

-- What the card sync writes.
set role service_role;
insert into public.fx_rates (currency, php, as_of) values ('USD', 58, '2026-10-23'), ('EUR', 63, '2026-10-23');
update public.cards set market_usd = 1.50, market_updated_at = '2026-10-23' where id = 'pokemon:sv8-2';
update public.cards set market_eur = 2.00 where id = 'one-piece:OP01-002';
update public.card_sets set printed_total = 191 where id = 'pokemon:sv8';
reset role;

-- Global prices -------------------------------------------------------------

set role authenticated;
select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000031', false) as _ \gset

do $$
declare
  p record;
begin
  select * into p from public.card_prices where card_id = 'pokemon:sv8-2';
  if p.global_php <> 87 or p.global_source <> 'TCGplayer' or p.local_php is not null or p.value_php <> 87 then
    raise exception 'TCGplayer price should be 1.50 × 58 = ₱87: %', row_to_json(p);
  end if;
  select * into p from public.card_prices where card_id = 'one-piece:OP01-002';
  if p.global_php <> 126 or p.global_source <> 'Cardmarket' then
    raise exception 'Cardmarket price should be 2.00 × 63 = ₱126: %', row_to_json(p);
  end if;
  select * into p from public.card_prices where card_id = 'pokemon:sv8-1';
  if p.value_php is not null or p.local_sales <> 0 then
    raise exception 'a card with no sales and no global price has no price: %', row_to_json(p);
  end if;
end $$;

-- Logging sales ---------------------------------------------------------------

do $$
begin
  perform public.log_sale('pokemon:sv8-1', 100);
  perform public.log_sale('pokemon:sv8-1', 120, 'card', 'LP', null, null, ((now() at time zone 'Asia/Manila')::date - 3));
  perform public.log_sale('pokemon:sv8-1', 1000);           -- a silly price
  perform public.log_sale('pokemon:sv8-1', 10, 'card', 'DMG');  -- damaged: not in the headline price
  perform public.log_sale('pokemon:sv8-1', 5000, 'graded', null, 'PSA', 10);
  perform set_config('test.my_sale', public.log_sale('pokemon:sv8-1', 130)::text, false);

  begin
    perform public.log_sale('pokemon:sv8-1', 0);
    raise exception 'a ₱0 sale was accepted';
  exception when raise_exception then
    if sqlerrm not like 'Enter a price%' then raise; end if;
  end;
  begin
    perform public.log_sale('pokemon:sv8-1', 100, 'card', 'NM', null, null, ((now() at time zone 'Asia/Manila')::date + 2));
    raise exception 'a sale in the future was accepted';
  exception when raise_exception then
    if sqlerrm not like 'The sale date%' then raise; end if;
  end;
  begin
    perform public.log_sale('pokemon:sv8-1', 100, 'card', 'NM', null, null, ((now() at time zone 'Asia/Manila')::date - 400));
    raise exception 'a sale from over a year ago was accepted';
  exception when raise_exception then
    if sqlerrm not like 'The sale date%' then raise; end if;
  end;
  begin
    perform public.log_sale('pokemon:sv8-1', 100, 'graded', null, 'PSA', null);
    raise exception 'a graded sale without a grade was accepted';
  exception when raise_exception then
    if sqlerrm not like 'Choose the grading company%' then raise; end if;
  end;
  begin
    perform public.log_sale('nope:card', 100);
    raise exception 'a sale for a card that does not exist was accepted';
  exception when raise_exception then
    if sqlerrm <> 'Card not found' then raise; end if;
  end;
end $$;

do $$
declare
  p record;
begin
  select * into p from public.card_prices where card_id = 'pokemon:sv8-1';
  -- NM/LP raw sales: 100, 120, 1000, 130 -> median 125
  if p.local_php <> 125 or p.local_sales <> 4 or p.local_low <> 100 or p.local_high <> 1000 or p.value_php <> 125 then
    raise exception 'HunterX price should be the median of raw NM/LP sales (125): %', row_to_json(p);
  end if;
  if p.last_sold_php <> 130 then
    raise exception 'last sold should be the newest NM/LP sale: %', row_to_json(p);
  end if;
end $$;

-- Members see prices but not who logged them, and can't write sales directly.
do $$
begin
  if (select count(*) from public.sales where card_id = 'pokemon:sv8-1') <> 6 then
    raise exception 'members should see every sale price';
  end if;
  begin
    perform logged_by from public.sales limit 1;
    raise exception 'members can see who logged a sale';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.sales (game_id, card_id, kind, price) values ('pokemon', 'pokemon:sv8-1', 'card', 1);
    raise exception 'members can insert sales directly';
  exception when insufficient_privilege then null;
  end;
end $$;

-- card_sales marks your own logged sales.
do $$
begin
  if (select count(*) from public.card_sales('pokemon:sv8-1') where mine and can_remove) <> 6 then
    raise exception 'the logger should see their 6 sales as theirs';
  end if;
end $$;

select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000032', false) as _ \gset
do $$
begin
  if exists (select 1 from public.card_sales('pokemon:sv8-1') where mine or can_remove) then
    raise exception 'another member should not see the sales as theirs';
  end if;
  begin
    perform public.remove_logged_sale(current_setting('test.my_sale')::uuid);
    raise exception 'a member removed someone else''s sale';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000033', false) as _ \gset
do $$
begin
  begin
    perform public.log_sale('pokemon:sv8-1', 100);
    raise exception 'someone outside the Discord logged a sale';
  exception when insufficient_privilege then null;
  end;
end $$;

-- The logger removes their own; a mod removes another; nobody removes market sales.
select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000031', false) as _ \gset
select public.remove_logged_sale(current_setting('test.my_sale')::uuid);

select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000034', false) as _ \gset
do $$
declare
  silly uuid;
  market uuid;
begin
  if not exists (select 1 from public.card_sales('pokemon:sv8-1') where can_remove and not mine) then
    raise exception 'mods should be able to remove logged sales';
  end if;
  select id into silly from public.card_sales('pokemon:sv8-1') where price = 1000;
  perform public.remove_logged_sale(silly);

  select id into market from public.sales where source = 'market' limit 1;
  if market is not null then
    begin
      perform public.remove_logged_sale(market);
      raise exception 'a marketplace sale was removed';
    exception when insufficient_privilege then null;
    end;
  end if;

  if (select local_php from public.card_prices where card_id = 'pokemon:sv8-1') <> 110 then
    raise exception 'after removals the HunterX price should be the median of 100 and 120';
  end if;
end $$;

-- 20 logged sales a day at most.
select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000032', false) as _ \gset
do $$
begin
  for i in 1..20 loop
    perform public.log_sale('pokemon:sv8-238', 1000 + i);
  end loop;
  begin
    perform public.log_sale('pokemon:sv8-238', 999);
    raise exception 'the 21st sale in a day was accepted';
  exception when raise_exception then
    if sqlerrm not like 'You can log up to 20%' then raise; end if;
  end;
end $$;

-- Binder value ----------------------------------------------------------------

select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000031', false) as _ \gset
insert into public.collection_items (card_id, kind, quantity, condition) values
  ('pokemon:sv8-1', 'card', 2, 'NM'),      -- HunterX price 110
  ('pokemon:sv8-2', 'card', 1, 'NM');      -- global price 87
insert into public.collection_items (card_id, kind, quantity, grader, grade) values
  ('pokemon:sv8-238', 'graded', 1, 'PSA', 9); -- graded: not counted

do $$
declare
  v record;
begin
  select * into v from public.my_collection_value;
  if v.value_php <> 307 or v.priced_cards <> 3 or v.raw_cards <> 3 then
    raise exception 'binder value should be 2 × 110 + 87 = 307 for 3 raw cards: %', row_to_json(v);
  end if;
end $$;

-- Other things members can read.
do $$
begin
  if not exists (select 1 from public.recent_sales where card_id = 'pokemon:sv8-1' and name = 'Exeggcute') then
    raise exception 'recent sales should include the card name';
  end if;
  if (select php from public.fx_rates where currency = 'USD') <> 58 then
    raise exception 'members should read exchange rates';
  end if;
  begin
    update public.fx_rates set php = 1 where currency = 'USD';
    raise exception 'members can change exchange rates';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

set role anon;
do $$
begin
  begin
    perform 1 from public.card_prices limit 1;
    raise exception 'signed-out visitors can read card prices';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.log_sale('pokemon:sv8-1', 100);
    raise exception 'signed-out visitors can log sales';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false) as _ \gset

select 'All price guide checks passed' as result;
