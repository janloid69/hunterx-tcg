import assert from 'node:assert/strict';
import { test } from 'node:test';

import { escapeMarkdown, mention, peso, quote, stars, truncate } from '../src/format.mjs';
import {
  listingPost,
  newMessageDm,
  offerAnsweredDm,
  reportStatusNote,
  reportThreadName,
  reportTicket,
  soldToYouDm,
  vouchPost,
} from '../src/render.mjs';
import { buyer, config, listing, mod, report, seller } from './fixtures.mjs';

const site = { siteUrl: config.siteUrl, supabaseUrl: config.supabaseUrl };
const buttons = (payload) => payload.components.flatMap((row) => row.components);

test('peso formats like the website', () => {
  assert.equal(peso(1500), '₱1,500');
  assert.equal(peso('1300.50'), '₱1,300.5');
  assert.equal(peso(0), '₱0');
});

test('truncate and escape', () => {
  assert.equal(truncate('abcdef', 4), 'abc…');
  assert.equal(truncate('abc', 4), 'abc');
  assert.equal(escapeMarkdown('**free** [link](x) _hi_ `code`'), '\\*\\*free\\*\\* \\[link\\]\\(x\\) \\_hi\\_ \\`code\\`');
  assert.equal(escapeMarkdown('# big\n- list\n> quote'), '\\# big\n\\- list\n\\> quote');
  assert.equal(escapeMarkdown('<@&123> @everyone'), '\\<@&123\\> @everyone');
  assert.equal(quote('a\nb'), '> a\n> b');
  assert.equal(stars(4), '★★★★☆');
});

test('mention uses the Discord account when known', () => {
  assert.equal(mention(seller), '<@400000000000000001>');
  assert.equal(mention({ display_name: 'No *Discord*' }), '**No \\*Discord\\***');
  assert.equal(mention(null), '**A member**');
});

test('active listing post', () => {
  const payload = listingPost(listing(), { ...site, stats: { vouch_count: 3, rating_avg: 4.67 } });
  const [embed] = payload.embeds;
  assert.equal(embed.title, "Shiki (048) · The World's Strongest Warriors OP17-048");
  assert.equal(embed.url, 'https://hunterxtcg.com/market/listing-uuid');
  assert.equal(embed.color, 0xff6b1a);
  assert.equal(embed.image.url, 'https://example.supabase.co/storage/v1/object/public/listing-photos/seller-uuid/1729-front.jpg');
  const field = (name) => embed.fields.find((f) => f.name === name)?.value;
  assert.equal(field('Price'), '₱500');
  assert.equal(field('Condition'), 'Near mint');
  assert.equal(field('Game'), 'One Piece');
  assert.equal(field('Card'), "The World's Strongest Warriors · #OP17-048 · SR");
  assert.equal(field('Seller'), '<@400000000000000001> · ✅ Verified Seller · ★ 4.7 (3 vouches)');
  assert.equal(field('Delivery'), 'Meetup: SM North · Shipping');
  assert.equal(field('Payment'), 'GCash, Maya');
  const [link] = buttons(payload);
  assert.equal(link.style, 5);
  assert.equal(link.label, 'View and message seller');
});

test('sold, reserved and graded listing posts', () => {
  const sold = listingPost(listing({ status: 'sold' }), site).embeds[0];
  assert.match(sold.title, /^SOLD · /);
  assert.equal(sold.color, 0x5c5c66);
  assert.equal(sold.fields[0].value, '~~₱500~~ Sold');

  const reserved = listingPost(listing({ status: 'reserved' }), site).embeds[0];
  assert.match(reserved.title, /^RESERVED · /);

  const graded = listingPost(listing({ kind: 'graded', grader: 'PSA', grade: 10, condition: null, photos: [] }), site).embeds[0];
  assert.equal(graded.fields[1].name, 'Grade');
  assert.equal(graded.fields[1].value, 'PSA 10');
  assert.equal(graded.image.url, 'https://img/l.png', 'falls back to the card image');

  const long = listingPost(listing({ title: 'x'.repeat(300), quantity: 3 }), site).embeds[0];
  assert.equal(long.title.length, 256);
  assert.equal(long.fields[0].value, '₱500 each · 3 available');
});

test('vouch post names who was buyer and seller', () => {
  const payload = vouchPost(
    {
      id: 'v1',
      rating: 5,
      comment: 'Smooth deal, legit!',
      author_id: buyer.id,
      author: buyer,
      subject: seller,
      created_at: '2026-10-24T04:00:00Z',
      listing: { id: 'listing-uuid', title: 'Shiki (048)', price: 500, sold_price: 300, seller_id: seller.id },
    },
    site,
  );
  const text = payload.embeds[0].description;
  assert.match(text, /<@400000000000000002> \(buyer\) vouched for <@400000000000000001> \(seller\)/);
  assert.match(text, /★★★★★/);
  assert.match(text, /> Smooth deal, legit!/);
  assert.match(text, /\[Shiki \\\(048\\\)\]\(https:\/\/hunterxtcg\.com\/market\/listing-uuid\) · ₱300/);
});

test('new report ticket pings mods and has the right buttons', () => {
  const payload = reportTicket(report(), { siteUrl: config.siteUrl, modRoleId: config.modRoleId, isNew: true });
  assert.equal(payload.content, '<@&200000000000000002> New report. A mod should reply within 24 hours.');
  assert.deepEqual(payload.allowed_mentions, { parse: [], roles: ['200000000000000002'] });
  assert.deepEqual(
    buttons(payload).map((b) => b.custom_id ?? b.url),
    [
      'hx:report:resolve:report-uuid-1234',
      'hx:report:dismiss:report-uuid-1234',
      'hx:report:hide:report-uuid-1234',
      'https://hunterxtcg.com/mod',
    ],
  );
  const embed = payload.embeds[0];
  assert.equal(embed.title, 'Report: Fake or counterfeit item');
  assert.equal(embed.fields.find((f) => f.name === 'Status').value, '🟠 Open · please reply within 24 hours');
  assert.equal(reportThreadName(report()), 'Fake or counterfeit item · Kiluwa');
});

test('handled report ticket', () => {
  const payload = reportTicket(
    report({ status: 'resolved', handler: mod, handled_at: '2026-10-24T05:00:00Z', listing: { id: 'listing-uuid', title: 'Shiki', hidden_at: '2026-10-24T04:30:00Z' } }),
    { siteUrl: config.siteUrl, modRoleId: config.modRoleId },
  );
  assert.equal(payload.content, undefined, 'edits keep the original ping text');
  assert.deepEqual(
    buttons(payload).map((b) => b.label),
    ['Reopen', 'Restore listing', 'Reports page'],
  );
  const embed = payload.embeds[0];
  assert.equal(embed.color, 0x5bd68a);
  assert.match(embed.fields.find((f) => f.name === 'Status').value, /^✅ Resolved by <@400000000000000003> <t:\d+:R>$/);
  assert.match(embed.fields.find((f) => f.name === 'About').value, /hidden from the Market/);
  assert.equal(reportStatusNote(report({ status: 'dismissed', handler: mod })).content, '<@400000000000000003> dismissed this report.');
});

test('DMs', () => {
  const offer = newMessageDm({
    message: { kind: 'offer', offer_amount: 300, body: 'Last na po?' },
    sender: buyer,
    listing: { title: 'Shiki (048)', price: 500 },
    conversationId: 'convo-1',
    siteUrl: config.siteUrl,
  });
  assert.match(offer.content, /^💸 \*\*Miromozzz\*\* offered \*\*₱300\*\* for \*\*Shiki \\\(048\\\)\*\* \(listed at ₱500\)\.\n> Last na po\?/);
  assert.equal(buttons(offer)[0].url, 'https://hunterxtcg.com/messages/convo-1');

  const text = newMessageDm({
    message: { kind: 'text', body: 'Available pa?' },
    sender: buyer,
    listing: { title: 'Shiki' },
    conversationId: 'convo-1',
    siteUrl: config.siteUrl,
  });
  assert.match(text.content, /sent you a message about \*\*Shiki\*\*:\n> Available pa\?/);
  assert.match(text.content, /turn these DMs off/);

  const accepted = offerAnsweredDm({
    message: { offer_amount: 300, offer_status: 'accepted' },
    seller,
    listing: { title: 'Shiki' },
    conversationId: 'convo-1',
    siteUrl: config.siteUrl,
  });
  assert.match(accepted.content, /^✅ \*\*Kiluwa\*\* accepted your \*\*₱300\*\* offer/);

  const sold = soldToYouDm({ listing: listing({ status: 'sold' }), siteUrl: config.siteUrl });
  assert.match(sold.content, /marked .* as sold to you/);
  assert.equal(buttons(sold)[0].label, 'Leave a vouch');
});
