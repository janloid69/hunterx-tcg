-- End-to-end check, step 2: the seller marks it sold to the buyer, the buyer
-- vouches, and the buyer reports the listing.

set role authenticated;
select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000021', false) as _ \gset
update public.listings set status = 'sold', buyer_id = 'cccccccc-0000-0000-0000-000000000022', sold_price = 800
 where id = 'dddddddd-0000-0000-0000-000000000001';

select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000022', false) as _ \gset
insert into public.vouches (id, listing_id, subject_id, rating, comment)
values ('ffffffff-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001',
        'cccccccc-0000-0000-0000-000000000021', 5, 'Legit, fast reply');
insert into public.reports (id, listing_id, reason, details)
values ('abababab-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001', 'other', 'Testing the ticket');
reset role;
select set_config('request.jwt.claim.sub', '', false) as _ \gset

update public.bot_outbox set available_at = now() where processed_at is null;
