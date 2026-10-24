import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DiscordError } from '../src/discord-rest.mjs';
import { createHandlers } from '../src/handlers.mjs';
import { fakeDiscord, fakeStore, gone } from './fakes.mjs';
import { buyer, config, listing, mod, report, seller } from './fixtures.mjs';

function setup({ data = {}, discord = {}, reportsMode = 'thread', now } = {}) {
  const store = fakeStore({
    people: { [seller.id]: seller, [buyer.id]: buyer, [mod.id]: mod },
    ...data,
  });
  const dc = fakeDiscord(discord);
  const logs = [];
  const handlers = createHandlers({ store, discord: dc, config, log: (m) => logs.push(m), reportsMode, now });
  const run = (kind, event, ref_id) => handlers.handle({ kind, event, ref_id });
  return { store, dc, logs, run };
}

test('a new listing is posted to the market channel, edits update it', async () => {
  const { store, dc, run } = setup({ data: { listings: { 'listing-uuid': listing() } } });
  await run('listing', 'created', 'listing-uuid');
  const [[, channelId, payload]] = dc.named('sendMessage');
  assert.equal(channelId, config.marketChannelId);
  assert.match(payload.embeds[0].title, /^Shiki/);
  const post = store.posts.get('listing:listing-uuid');
  assert.equal(post.channel_id, config.marketChannelId);

  store.data.listings['listing-uuid'] = listing({ price: 450 });
  await run('listing', 'updated', 'listing-uuid');
  const [[, editChannel, editId, edited]] = dc.named('editMessage');
  assert.equal(editChannel, config.marketChannelId);
  assert.equal(editId, post.message_id);
  assert.equal(edited.embeds[0].fields[0].value, '₱450');
  assert.equal(dc.named('sendMessage').length, 1, 'no second post');
});

test('selling marks the post SOLD and asks the buyer for a vouch once', async () => {
  const { store, dc, run } = setup({ data: { listings: { 'listing-uuid': listing() } } });
  await run('listing', 'created', 'listing-uuid');
  store.data.listings['listing-uuid'] = listing({ status: 'sold', buyer_id: buyer.id, buyer, sold_price: 300 });
  await run('listing', 'updated', 'listing-uuid');
  await run('listing', 'updated', 'listing-uuid');

  assert.match(dc.named('editMessage')[0][3].embeds[0].title, /^SOLD · /);
  const dms = dc.named('dm');
  assert.equal(dms.length, 1, 'one vouch reminder, even if the event runs twice');
  assert.equal(dms[0][1], buyer.discord_id);
  assert.match(dms[0][2].content, /as sold to you/);
});

test('hidden, removed and deleted listings disappear from the market channel', async () => {
  const { store, dc, run } = setup({ data: { listings: { 'listing-uuid': listing() } } });
  await run('listing', 'created', 'listing-uuid');
  const messageId = store.posts.get('listing:listing-uuid').message_id;

  store.data.listings['listing-uuid'] = listing({ hidden_at: '2026-10-24T05:00:00Z' });
  await run('listing', 'updated', 'listing-uuid');
  assert.deepEqual(dc.named('deleteMessage')[0].slice(1), [config.marketChannelId, messageId]);
  assert.equal(store.posts.has('listing:listing-uuid'), false);

  // Restored by a mod: posted again.
  store.data.listings['listing-uuid'] = listing();
  await run('listing', 'updated', 'listing-uuid');
  assert.equal(dc.named('sendMessage').length, 2);

  store.data.listings['listing-uuid'] = undefined;
  await run('listing', 'deleted', 'listing-uuid');
  assert.equal(dc.named('deleteMessage').length, 2);
  assert.equal(store.posts.has('listing:listing-uuid'), false);
});

test('a listing that sold before the bot saw it is not posted', async () => {
  const { dc, run } = setup({ data: { listings: { 'listing-uuid': listing({ status: 'sold' }) } } });
  await run('listing', 'created', 'listing-uuid');
  assert.equal(dc.named('sendMessage').length, 0);
});

test('a market post deleted by hand in Discord is posted again while active', async () => {
  const { store, dc, logs, run } = setup({ data: { listings: { 'listing-uuid': listing() } }, discord: { failEdits: gone() } });
  await store.putPost('listing', 'listing-uuid', { channel_id: config.marketChannelId, message_id: 'old' });
  await run('listing', 'updated', 'listing-uuid');
  assert.equal(dc.named('sendMessage').length, 1);
  assert.notEqual(store.posts.get('listing:listing-uuid').message_id, 'old');
  assert.match(logs.join('\n'), /deleted in Discord/);
});

test('other Discord errors are thrown so the event is retried', async () => {
  const denied = new DiscordError(403, 50013, 'Missing Permissions', 'POST', '/channels/1/messages');
  const { store, run } = setup({ data: { listings: { 'listing-uuid': listing() } }, discord: { failEdits: denied } });
  await store.putPost('listing', 'listing-uuid', { channel_id: config.marketChannelId, message_id: 'm1' });
  await assert.rejects(run('listing', 'updated', 'listing-uuid'), /Missing Permissions/);
});

function chat(overrides = {}) {
  return {
    id: 'msg-1',
    kind: 'text',
    body: 'Available pa?',
    sender_id: buyer.id,
    offer_amount: null,
    offer_status: null,
    created_at: '2026-10-24T06:00:00Z',
    conversation: {
      id: 'convo-1',
      buyer_id: buyer.id,
      seller_id: seller.id,
      last_message_at: '2026-10-24T06:00:00Z',
      buyer_last_read_at: '2026-10-24T06:00:00Z',
      seller_last_read_at: '2026-10-24T05:00:00Z',
      listing: { id: 'listing-uuid', title: 'Shiki', price: 500 },
    },
    ...overrides,
  };
}

test('new messages DM the other person, at most once per chat in the cooldown', async () => {
  let clock = 1_000_000;
  const { store, dc, run } = setup({ data: { messages: { 'msg-1': chat(), 'msg-2': chat({ id: 'msg-2' }) } }, now: () => clock });
  await run('message', 'created', 'msg-1');
  await run('message', 'created', 'msg-2');
  let dms = dc.named('dm');
  assert.equal(dms.length, 1);
  assert.equal(dms[0][1], seller.discord_id);
  assert.match(dms[0][2].content, /Miromozzz\*\* sent you a message/);

  // Offers always get through.
  store.data.messages['offer-1'] = chat({ id: 'offer-1', kind: 'offer', offer_amount: 300, offer_status: 'pending' });
  await run('message', 'created', 'offer-1');
  assert.equal(dc.named('dm').length, 2);

  clock += config.dmCooldownMs + 1;
  await run('message', 'created', 'msg-2');
  dms = dc.named('dm');
  assert.equal(dms.length, 3, 'after the cooldown, DMs again');
});

test('no DM for messages already read, system notes, or members who turned DMs off', async () => {
  const read = chat({ conversation: { ...chat().conversation, seller_last_read_at: '2026-10-24T06:00:30Z' } });
  const { store, dc, run } = setup({
    data: {
      messages: { read, system: chat({ id: 'system', kind: 'system', sender_id: null }) },
    },
  });
  await run('message', 'created', 'read');
  await run('message', 'created', 'system');
  store.data.people[seller.id] = { ...seller, discord_dms: false };
  store.data.messages.quiet = chat({ id: 'quiet' });
  await run('message', 'created', 'quiet');
  assert.equal(dc.named('dm').length, 0);
});

test('accepted offers DM the buyer unless they already saw it', async () => {
  const answered = chat({
    id: 'offer-1',
    kind: 'offer',
    offer_amount: 300,
    offer_status: 'accepted',
    conversation: { ...chat().conversation, last_message_at: '2026-10-24T06:05:00Z', buyer_last_read_at: '2026-10-24T06:00:00Z' },
  });
  const { store, dc, run } = setup({ data: { messages: { 'offer-1': answered } } });
  await run('offer', 'updated', 'offer-1');
  const [[, to, payload]] = dc.named('dm');
  assert.equal(to, buyer.discord_id);
  assert.match(payload.content, /Kiluwa\*\* accepted your \*\*₱300\*\* offer/);

  store.data.messages['offer-1'] = { ...answered, conversation: { ...answered.conversation, buyer_last_read_at: '2026-10-24T06:06:00Z' } };
  await run('offer', 'updated', 'offer-1');
  assert.equal(dc.named('dm').length, 1);
});

test('vouches are posted once and removed when deleted', async () => {
  const vouch = { id: 'v1', rating: 5, comment: 'Legit', author_id: buyer.id, author: buyer, subject: seller, listing: null, created_at: '2026-10-24T07:00:00Z' };
  const { store, dc, run } = setup({ data: { vouches: { v1: vouch } } });
  await run('vouch', 'created', 'v1');
  await run('vouch', 'created', 'v1');
  assert.equal(dc.named('sendMessage').length, 1);
  assert.equal(dc.named('sendMessage')[0][1], config.vouchChannelId);
  await run('vouch', 'deleted', 'v1');
  assert.equal(dc.named('deleteMessage').length, 1);
  assert.equal(store.posts.has('vouch:v1'), false);
});

test('a report opens a ticket with a thread and thanks the reporter', async () => {
  const { store, dc, run } = setup({ data: { reports: { r1: report({ id: 'r1' }) } } });
  await run('report', 'created', 'r1');
  const [[, channelId, payload]] = dc.named('sendMessage');
  assert.equal(channelId, config.reportsChannelId);
  assert.match(payload.content, /^<@&200000000000000002> New report/);
  const [[, threadParent, messageId, name]] = dc.named('startThread');
  assert.equal(threadParent, config.reportsChannelId);
  assert.equal(name, 'Fake or counterfeit item · Kiluwa');
  const post = store.posts.get('report:r1');
  assert.equal(post.message_id, messageId);
  assert.ok(post.thread_id);
  assert.equal(post.state, 'open');
  const [[, to, dm]] = dc.named('dm');
  assert.equal(to, buyer.discord_id);
  assert.match(dm.content, /Thanks for your report/);
});

test('resolving a report updates the ticket, notes it, archives the thread and tells the reporter once', async () => {
  const { store, dc, run } = setup({ data: { reports: { r1: report({ id: 'r1' }) } } });
  await run('report', 'created', 'r1');
  const threadId = store.posts.get('report:r1').thread_id;

  store.data.reports.r1 = report({ id: 'r1', status: 'resolved', handler: mod, handled_at: '2026-10-24T08:00:00Z' });
  await run('report', 'updated', 'r1');
  await run('report', 'updated', 'r1');

  assert.equal(dc.named('editMessage').length, 2);
  const notes = dc.named('sendMessage').filter((call) => call[1] === threadId);
  assert.equal(notes.length, 1, 'one note per status change');
  assert.match(notes[0][2].content, /marked this report resolved/);
  assert.deepEqual(dc.named('editChannel').map((call) => call.slice(1)), [[threadId, { archived: true }]]);
  const closedDms = dc.named('dm').filter((call) => /reviewed your report/.test(call[2].content));
  assert.equal(closedDms.length, 1);

  // Reopened: thread unarchived before the note.
  store.data.reports.r1 = report({ id: 'r1', status: 'open', handler: mod });
  await run('report', 'updated', 'r1');
  const last = dc.calls.slice(-3).map((call) => call[0]);
  assert.deepEqual(last, ['editMessage', 'editChannel', 'sendMessage']);
  assert.deepEqual(dc.named('editChannel').at(-1).slice(1), [threadId, { archived: false }]);
});

test('report tickets as forum posts', async () => {
  const { store, dc, run } = setup({ reportsMode: 'forum', data: { reports: { r1: report({ id: 'r1' }) } } });
  await run('report', 'created', 'r1');
  const [[, channelId, name]] = dc.named('createForumPost');
  assert.equal(channelId, config.reportsChannelId);
  assert.equal(name, 'Fake or counterfeit item · Kiluwa');
  const post = store.posts.get('report:r1');
  assert.equal(post.channel_id, post.thread_id);
});

test('editing a ticket in an archived forum thread unarchives it first', async () => {
  const archived = new DiscordError(400, 50083, 'Thread is archived', 'PATCH', '/channels/1/messages/1');
  const { store, dc, run } = setup({ reportsMode: 'forum', discord: { failEdits: archived }, data: { reports: { r1: report({ id: 'r1', status: 'resolved' }) } } });
  await store.putPost('report', 'r1', { channel_id: 't1', message_id: 't1', thread_id: 't1', state: 'resolved' });
  await run('report', 'updated', 'r1');
  assert.deepEqual(
    dc.calls.map((call) => call[0]),
    ['editMessage', 'editChannel', 'editMessage', 'editChannel'],
  );
});

test('members with closed DMs are skipped without failing', async () => {
  const { dc, logs, run } = setup({ data: { messages: { 'msg-1': chat() } }, discord: { closedDms: [seller.discord_id] } });
  await run('message', 'created', 'msg-1');
  assert.equal(dc.named('dm').length, 1);
  assert.match(logs.join('\n'), /Couldn't DM Kiluwa/);
});
