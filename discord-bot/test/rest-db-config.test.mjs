import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ConfigError, loadConfig } from '../src/config.mjs';
import { createDb, DbError } from '../src/db.mjs';
import { createDiscordRest, DiscordError, routeKey } from '../src/discord-rest.mjs';

function fakeFetch(responses) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, ...init, body: init.body ? JSON.parse(init.body) : undefined });
    const next = responses.shift();
    if (!next) throw new Error(`unexpected request to ${url}`);
    const { status = 200, body = null, headers = {} } = next;
    return new Response(status === 204 ? null : JSON.stringify(body), { status, headers });
  };
  return { fetchImpl, calls };
}

const noSleep = async () => {};

test('rate-limit keys keep the first id only', () => {
  assert.equal(routeKey('PATCH', '/channels/111111111111111111/messages/222222222222222222'), 'PATCH /channels/111111111111111111/messages/:id');
});

test('sends messages without pinging anyone by default', async () => {
  const { fetchImpl, calls } = fakeFetch([{ body: { id: 'm1' } }]);
  const discord = createDiscordRest({ token: 'tok', fetchImpl, sleep: noSleep });
  await discord.sendMessage('123456789012345678', { content: 'hi @everyone' });
  assert.equal(calls[0].url, 'https://discord.com/api/v10/channels/123456789012345678/messages');
  assert.equal(calls[0].headers.Authorization, 'Bot tok');
  assert.deepEqual(calls[0].body.allowed_mentions, { parse: [] });
});

test('waits out a 429 and retries', async () => {
  const slept = [];
  const { fetchImpl, calls } = fakeFetch([{ status: 429, body: { retry_after: 1.5 } }, { body: { id: 'm1' } }]);
  const discord = createDiscordRest({ token: 'tok', fetchImpl, sleep: async (ms) => slept.push(ms) });
  const result = await discord.sendMessage('123456789012345678', { content: 'x' });
  assert.equal(result.id, 'm1');
  assert.equal(calls.length, 2);
  assert.equal(slept[0], 1600);
});

test('errors carry Discord codes; DMs to closed inboxes return null', async () => {
  const { fetchImpl } = fakeFetch([
    { status: 404, body: { code: 10008, message: 'Unknown Message' } },
    { body: { id: 'dm-channel' } },
    { status: 403, body: { code: 50007, message: 'Cannot send messages to this user' } },
  ]);
  const discord = createDiscordRest({ token: 'tok', fetchImpl, sleep: noSleep });
  await assert.rejects(discord.editMessage('1', '2', {}), (error) => error instanceof DiscordError && error.isGone && error.code === 10008);
  assert.equal(await discord.dm('400000000000000001', { content: 'hi' }), null);
});

test('button tokens never appear in error messages, and skip bot auth', async () => {
  const { fetchImpl, calls } = fakeFetch([{ status: 400, body: { code: 40060, message: 'Interaction has already been acknowledged.' } }]);
  const discord = createDiscordRest({ token: 'tok', fetchImpl, sleep: noSleep });
  await assert.rejects(discord.interactionCallback('123456789012345678', 'SECRET_TOKEN_VALUE', { type: 6 }), (error) => {
    assert.doesNotMatch(error.message, /SECRET_TOKEN_VALUE/);
    return true;
  });
  assert.equal(calls[0].headers.Authorization, undefined);
});

test('lists every member across pages, without bots', async () => {
  const page = (start, n) => Array.from({ length: n }, (_, i) => ({ user: { id: String(start + i) }, roles: [] }));
  const first = page(1000000000000000, 1000);
  first[5].user.bot = true;
  const { fetchImpl, calls } = fakeFetch([{ body: first }, { body: page(2000000000000000, 3) }]);
  const discord = createDiscordRest({ token: 'tok', fetchImpl, sleep: noSleep });
  const members = await discord.listMembers('100000000000000001');
  assert.equal(members.length, 1002);
  assert.match(calls[1].url, /after=1000000000000999$/);
});

test('database calls use the secret key and explain errors', async () => {
  const { fetchImpl, calls } = fakeFetch([
    { body: [{ id: 1 }] },
    { status: 404, body: { code: 'PGRST202', message: 'Could not find the function public.bot_next_events', hint: null } },
  ]);
  const db = createDb({ url: 'https://x.supabase.co/', secretKey: 'sb_secret_abc', fetchImpl, sleep: noSleep });
  assert.deepEqual(await db.rpc('bot_next_events', { p_limit: 1 }), [{ id: 1 }]);
  assert.equal(calls[0].url, 'https://x.supabase.co/rest/v1/rpc/bot_next_events');
  assert.equal(calls[0].headers.apikey, 'sb_secret_abc');
  assert.equal(calls[0].headers.Authorization, undefined, 'new secret keys are not JWTs');
  await assert.rejects(db.rpc('bot_next_events'), (error) => error instanceof DbError && error.code === 'PGRST202');
});

const goodEnv = {
  DISCORD_BOT_TOKEN: 'tok',
  SUPABASE_URL: 'https://czqillqyyqhdgjqozwqm.supabase.co/',
  SUPABASE_SECRET_KEY: 'sb_secret_abc',
  DISCORD_GUILD_ID: '1539545293408837697',
  DISCORD_CIRCLE_ROLE_ID: '1539549174284943371',
  DISCORD_MOD_ROLE_ID: '1539548540261629992',
  MARKET_CHANNEL_ID: '1563383286875562064',
  VOUCH_CHANNEL_ID: '1563383721904709763',
  REPORTS_CHANNEL_ID: '1563383981464879154',
};

test('settings: good values and defaults', () => {
  const config = loadConfig(goodEnv);
  assert.equal(config.supabaseUrl, 'https://czqillqyyqhdgjqozwqm.supabase.co');
  assert.equal(config.siteUrl, 'https://hunterx-tcg.netlify.app');
  assert.equal(config.pollMs, 5000);
  assert.equal(config.dmCooldownMs, 600_000);
  assert.equal(loadConfig({ ...goodEnv, SUPABASE_SECRET_KEY: '', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_old' }).secretKey, 'sb_secret_old');
});

test('settings: mistakes are listed with fixes', () => {
  assert.throws(
    () => loadConfig({ ...goodEnv, DISCORD_BOT_TOKEN: '', SUPABASE_SECRET_KEY: 'sb_publishable_xyz', MARKET_CHANNEL_ID: '#market' }),
    (error) =>
      error instanceof ConfigError &&
      /DISCORD_BOT_TOKEN is empty/.test(error.message) &&
      /publishable key/.test(error.message) &&
      /MARKET_CHANNEL_ID/.test(error.message),
  );
});
