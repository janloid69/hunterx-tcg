-- End-to-end check, step 1: a seller lists a card, a buyer messages and makes
-- an offer, the seller accepts. Runs after the schema tests (uses their cards).

update public.bot_outbox set processed_at = now() where processed_at is null;

insert into auth.users (id, raw_user_meta_data) values
  ('cccccccc-0000-0000-0000-000000000021', '{"name": "e2e_seller", "full_name": "E2E Seller", "provider_id": "500000000000000021"}'),
  ('cccccccc-0000-0000-0000-000000000022', '{"name": "e2e_buyer", "full_name": "E2E Buyer", "provider_id": "500000000000000022"}'),
  ('cccccccc-0000-0000-0000-000000000023', '{"name": "e2e_mod", "full_name": "E2E Mod", "provider_id": "500000000000000023"}');

update public.profiles set in_guild = true, is_verified_seller = true where id = 'cccccccc-0000-0000-0000-000000000021';
update public.profiles set in_guild = true, is_mod = true where id = 'cccccccc-0000-0000-0000-000000000023';

set role authenticated;
select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000021', false) as _ \gset
insert into public.listings (id, game_id, card_id, title, kind, condition, price, meetup, meetup_area, shipping,
                             payment_methods, photos)
values ('dddddddd-0000-0000-0000-000000000001', 'one-piece', 'one-piece:OP01-001', 'Zoro leader (e2e)', 'card', 'NM',
        900, true, 'Cubao', true, array['GCash'], array['cccccccc-0000-0000-0000-000000000021/front.jpg']);

select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000022', false) as _ \gset
select set_config('e2e.convo', public.start_conversation('dddddddd-0000-0000-0000-000000000001')::text, false) as _ \gset
insert into public.messages (conversation_id, sender_id, kind, body)
values (current_setting('e2e.convo')::uuid, auth.uid(), 'text', 'Available pa po?');
insert into public.messages (id, conversation_id, sender_id, kind, body, offer_amount)
values ('eeeeeeee-0000-0000-0000-000000000001', current_setting('e2e.convo')::uuid, auth.uid(), 'offer', 'Last na?', 800);

-- The bot compares chat times to the millisecond (JavaScript dates). Without a
-- pause the seller's answer can land in the same millisecond as the offer, and
-- the bot then thinks the buyer already saw it and skips the DM.
do $$ begin perform pg_sleep(0.01); end $$;

select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000021', false) as _ \gset
update public.messages set offer_status = 'accepted' where id = 'eeeeeeee-0000-0000-0000-000000000001';
reset role;
select set_config('request.jwt.claim.sub', '', false) as _ \gset

-- Don't make the check wait the real minute.
update public.bot_outbox set available_at = now() where processed_at is null;
