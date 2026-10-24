// End-to-end check of the bot against a real database through PostgREST
// (what Supabase runs), with Discord faked. Proves the bot's queries, the
// database functions and the handlers fit together.
//
// Run with discord-bot/test/e2e/run.sh (it starts PostgREST). Needs a
// database with the migrations and schema tests applied, and psql settings
// (PGHOST, PGPORT, PGUSER, PGDATABASE, PGPASSWORD) in the environment.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { createDb } from '../../src/db.mjs';
import { createHandlers } from '../../src/handlers.mjs';
import { createStore } from '../../src/store.mjs';
import { createWorker } from '../../src/worker.mjs';
import { fakeDiscord } from '../fakes.mjs';
import { config } from '../fixtures.mjs';

const postgrest = process.env.POSTGREST_URL;
assert.ok(postgrest, 'Set POSTGREST_URL');

const SELLER = '500000000000000021';
const BUYER = '500000000000000022';
const MOD = '500000000000000023';
const LISTING = 'dddddddd-0000-0000-0000-000000000001';
const REPORT = 'abababab-0000-0000-0000-000000000001';

const psql = (file) =>
  execFileSync('psql', ['-v', 'ON_ERROR_STOP=1', '-q', '-f', path.join(import.meta.dirname, file)], { stdio: 'inherit' });

// The bot talks to https://<project>.supabase.co/rest/v1; PostgREST alone serves at its root.
const db = createDb({
  url: 'http://supabase.test',
  secretKey: 'sb_secret_e2e',
  fetchImpl: (url, init) => fetch(url.replace('http://supabase.test/rest/v1', postgrest), init),
  sleep: async () => {},
});
const store = createStore(db);
const discord = fakeDiscord();
const logs = [];
const log = (message) => {
  logs.push(message);
  console.log(`  bot: ${message}`);
};
const handlers = createHandlers({ store, discord, config, log, reportsMode: 'thread' });
const worker = createWorker({ store, handlers, log });

async function drain() {
  for (;;) {
    if ((await worker.runOnce()) === 0) break;
  }
  const stuck = await db.select('bot_outbox', 'processed_at=is.null&select=kind,event,last_error');
  assert.deepEqual(stuck, [], 'every event should be handled without errors');
}

const sent = (channelId) => discord.named('sendMessage').filter((call) => call[1] === channelId);
const dmsTo = (discordId) => discord.named('dm').filter((call) => call[1] === discordId).map((call) => call[2].content);

// Step 1: listing, chat, offer accepted ------------------------------------
psql('seed-1-listing-and-chat.sql');
await drain();

const [market] = sent(config.marketChannelId);
assert.ok(market, 'listing posted to the market channel');
const embed = market[2].embeds[0];
assert.equal(embed.title, 'Zoro leader (e2e)');
const field = (name) => embed.fields.find((f) => f.name === name)?.value;
assert.equal(field('Card'), 'Romance Dawn · #OP01-001 · L');
assert.equal(field('Game'), 'One Piece');
assert.equal(field('Seller'), `<@${SELLER}> · ✅ Verified Seller`);
assert.equal(embed.image.url, `${config.supabaseUrl}/storage/v1/object/public/listing-photos/cccccccc-0000-0000-0000-000000000021/front.jpg`);

const sellerDms = dmsTo(SELLER);
assert.equal(sellerDms.length, 2, 'seller hears about the message and the offer');
assert.match(sellerDms[0], /E2E Buyer\*\* sent you a message about \*\*Zoro leader \\\(e2e\\\)\*\*/);
assert.match(sellerDms[1], /offered \*\*₱800\*\*/);
assert.match(dmsTo(BUYER)[0], /E2E Seller\*\* accepted your \*\*₱800\*\* offer/);

const listingPost = await store.getPost('listing', LISTING);
assert.equal(listingPost.message_id, market[3]?.id ?? listingPost.message_id);
assert.equal(listingPost.channel_id, config.marketChannelId);

// Step 2: sold, vouch, report -----------------------------------------------
psql('seed-2-sale-vouch-report.sql');
await drain();

const soldEdit = discord.named('editMessage').find((call) => call[1] === config.marketChannelId);
assert.match(soldEdit[3].embeds[0].title, /^SOLD · Zoro leader/);
assert.ok(dmsTo(BUYER).some((text) => /as sold to you/.test(text)), 'buyer asked for a vouch');

const [vouch] = sent(config.vouchChannelId);
assert.match(vouch[2].embeds[0].description, new RegExp(`<@${BUYER}> \\(buyer\\) vouched for <@${SELLER}> \\(seller\\)`));
assert.match(vouch[2].embeds[0].description, /· ₱800/);

const [ticket] = sent(config.reportsChannelId);
assert.match(ticket[2].content, /New report/);
assert.equal(discord.named('startThread').length, 1);
assert.ok(dmsTo(BUYER).some((text) => /Thanks for your report/.test(text)));
const stats = await store.memberStats('cccccccc-0000-0000-0000-000000000021');
assert.equal(stats.vouch_count, 1);

// Step 3: a mod uses the ticket buttons ----------------------------------------
await assert.rejects(store.moderate(BUYER, REPORT, 'resolve'), (error) => /Sign in to the HunterX website/.test(error.message));
await store.moderate(MOD, REPORT, 'hide');
await store.moderate(MOD, REPORT, 'resolve');
await drain();

const handled = await db.one('reports', `id=eq.${REPORT}&select=status,handled_by`);
assert.deepEqual(handled, { status: 'resolved', handled_by: 'cccccccc-0000-0000-0000-000000000023' });
assert.ok(discord.named('deleteMessage').some((call) => call[1] === config.marketChannelId), 'hidden listing removed from the market channel');
const threadId = (await store.getPost('report', REPORT)).thread_id;
assert.ok(sent(threadId).some((call) => new RegExp(`<@${MOD}> marked this report resolved`).test(call[2].content)));
assert.ok(discord.named('editChannel').some((call) => call[1] === threadId && call[2].archived === true));
assert.ok(dmsTo(BUYER).some((text) => /reviewed your report/.test(text)));

// Step 4: role sync -------------------------------------------------------
const changed = await store.syncRoles({
  members: [{ id: SELLER, roles: [] }, { id: MOD, roles: [config.modRoleId] }],
  full: true,
  circleRoleId: config.circleRoleId,
  modRoleId: config.modRoleId,
});
assert.ok(changed >= 1);
const sellerNow = await db.one('profiles', `discord_id=eq.${SELLER}&select=in_guild,is_verified_seller,is_mod`);
assert.deepEqual(sellerNow, { in_guild: true, is_verified_seller: false, is_mod: false }, 'circle role gone, badge gone');
const modNow = await db.one('profiles', `discord_id=eq.${MOD}&select=is_mod`);
assert.equal(modNow.is_mod, true);

console.log('End-to-end bot check passed');
