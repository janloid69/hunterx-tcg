import assert from 'node:assert/strict';
import { test } from 'node:test';

import { loadConfig, ConfigError } from '../src/config.mjs';
import { avatarUrl, createDropSync, mapDrop, readableText } from '../src/drops.mjs';
import { fakeDiscord, fakeStore } from './fakes.mjs';
import { config } from './fixtures.mjs';

const DROPS = '300000000000000009';
const dropsConfig = { ...config, dropsChannelId: DROPS };
const roles = new Map([['500000000000000001', 'Pokemon']]);
const channels = new Map([['300000000000000010', 'pokemon']]);

const benzon = { id: '400000000000000050', username: 'benzonnn', global_name: 'benzonnn', avatar: 'abc123' };

const walmartPost = {
  id: '1600000000000000003',
  type: 0,
  channel_id: DROPS,
  author: benzon,
  content:
    '<@&500000000000000001>\n\nUpcoming Walmart (US) drops:\n\nUPC: https://www.walmart.com/ip/POKEMON-30TH-ANNIVERSARY-DAY-NIGHT-ULTRA-PREMIUM-COLLECTION/20887353294\n\nTime: Checking pa us pero feel free to drop information if alam nyo <#300000000000000010>',
  timestamp: '2026-10-29T15:07:00.000000+00:00',
  edited_timestamp: null,
  attachments: [],
  embeds: [{ type: 'link', url: 'https://www.walmart.com/ip/1' }],
  mentions: [],
};

const replyPost = {
  id: '1600000000000000002',
  type: 19,
  channel_id: DROPS,
  author: benzon,
  content: '30th Poster Collection^',
  timestamp: '2026-10-27T16:39:00.000000+00:00',
  edited_timestamp: '2026-10-27T16:40:00.000000+00:00',
  attachments: [],
  mentions: [],
  referenced_message: {
    id: '1600000000000000001',
    author: benzon,
    content: 'https://www.pokemoncenter.com/\n\nqueue up <@&500000000000000001>\n\nUS Addy only.',
    mentions: [],
  },
};

const imagePost = {
  id: '1600000000000000001',
  type: 0,
  channel_id: DROPS,
  author: { id: '400000000000000051', username: 'mod', global_name: null, avatar: null },
  content: '',
  timestamp: '2026-10-26T10:00:00.000000+00:00',
  edited_timestamp: null,
  attachments: [
    { id: '1', filename: 'restock.png', url: 'https://cdn.discordapp.com/attachments/1/2/restock.png?ex=1', content_type: 'image/png', width: 1080, height: 1920 },
  ],
  mentions: [],
};

test('readable text: roles, channels, people, emoji and timestamps', () => {
  const users = new Map([['400000000000000050', 'benzonnn']]);
  assert.equal(
    readableText('<@&500000000000000001> in <#300000000000000010> by <@!400000000000000050> <:pika:123> <@&9>', { roles, channels, users }),
    '@Pokemon in #pokemon by @benzonnn :pika: @role',
  );
  assert.equal(readableText('Drops <t:1761834600:f>'), 'Drops Oct 30, 10:30 PM');
  assert.equal(readableText('On <t:1761834600:D>'), 'On Oct 30, 2025');
});

test('avatar: their picture, or Discord\'s default one', () => {
  assert.equal(avatarUrl(benzon), 'https://cdn.discordapp.com/avatars/400000000000000050/abc123.png?size=64');
  assert.match(avatarUrl({ id: '400000000000000051', avatar: null }), /^https:\/\/cdn\.discordapp\.com\/embed\/avatars\/[0-5]\.png$/);
});

test('maps posts, replies and pictures; skips system messages and empty ones', () => {
  const opts = { guildId: config.guildId, roles, channels, now: 'now' };
  const walmart = mapDrop(walmartPost, opts);
  assert.equal(walmart.author_name, 'benzonnn');
  assert.ok(walmart.content.startsWith('@Pokemon\n\nUpcoming Walmart (US) drops:'));
  assert.ok(walmart.content.endsWith('if alam nyo #pokemon'));
  assert.equal(walmart.url, `https://discord.com/channels/${config.guildId}/${DROPS}/1600000000000000003`);
  assert.equal(walmart.reply, null);
  assert.deepEqual(walmart.attachments, []);

  const reply = mapDrop(replyPost, opts);
  assert.deepEqual(reply.reply, { author: 'benzonnn', content: 'https://www.pokemoncenter.com/ queue up @Pokemon US Addy only.' });
  assert.equal(reply.edited_at, '2026-10-27T16:40:00.000000+00:00');

  const image = mapDrop(imagePost, opts);
  assert.equal(image.author_name, 'mod');
  assert.equal(image.content, '');
  assert.deepEqual(image.attachments, [
    { url: 'https://cdn.discordapp.com/attachments/1/2/restock.png?ex=1', kind: 'image', name: 'restock.png', width: 1080, height: 1920 },
  ]);

  assert.equal(mapDrop({ ...walmartPost, type: 7 }, opts), null, 'join messages');
  assert.equal(mapDrop({ ...walmartPost, content: '   ', embeds: [] }, opts), null, 'nothing to show');
});

test('sync: saves the channel\'s posts newest first and caches role and channel names', async () => {
  const store = fakeStore();
  const discord = fakeDiscord();
  let roleCalls = 0;
  discord.listMessages = async (channelId, limit) => {
    assert.equal(channelId, DROPS);
    assert.equal(limit, 50);
    return [walmartPost, replyPost, imagePost, { ...walmartPost, id: '1600000000000000004', type: 6 }];
  };
  discord.listRoles = async () => {
    roleCalls += 1;
    return [{ id: '500000000000000001', name: 'Pokemon' }];
  };
  discord.listGuildChannels = async () => [{ id: '300000000000000010', name: 'pokemon' }];
  const logs = [];
  const drops = createDropSync({ store, discord, config: dropsConfig, log: (line) => logs.push(line) });

  assert.equal(await drops.sync(), 3);
  assert.equal(await drops.sync(), 3);
  const saved = store.calls.filter((call) => call[0] === 'saveDrops');
  assert.equal(saved.length, 2);
  assert.deepEqual(saved[0][1].map((row) => row.id), ['1600000000000000003', '1600000000000000002', '1600000000000000001']);
  assert.equal(roleCalls, 1, 'names are read once an hour, not every sync');
  assert.equal(logs.length, 1, 'logs only when the posts change');
  assert.match(logs[0], /^Drops: 3 posts on the website \(newest by benzonnn\)$/);
});

test('sync: does nothing without a drops channel', async () => {
  const store = fakeStore();
  const discord = fakeDiscord();
  discord.listMessages = async () => assert.fail('should not read any channel');
  const drops = createDropSync({ store, discord, config });
  assert.equal(await drops.sync(), 0);
  assert.equal(store.calls.length, 0);
});

test('sync: without Message Content Intent, warns once and keeps what was saved', async () => {
  const store = fakeStore();
  const discord = fakeDiscord();
  discord.listMessages = async () => [{ ...walmartPost, content: '', embeds: [] }, { ...replyPost, content: '' }];
  const logs = [];
  const drops = createDropSync({ store, discord, config: dropsConfig, log: (line) => logs.push(line) });
  assert.equal(await drops.sync(), 0);
  assert.equal(await drops.sync(), 0);
  assert.equal(store.calls.length, 0, 'nothing saved, so the website keeps the last good posts');
  assert.equal(logs.length, 1);
  assert.match(logs[0], /Message Content Intent/);
});

test('a post in the drops channel triggers one quick re-read; other channels don\'t', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const store = fakeStore();
  const discord = fakeDiscord();
  let reads = 0;
  discord.listMessages = async () => {
    reads += 1;
    return [];
  };
  const drops = createDropSync({ store, discord, config: dropsConfig });
  drops.onMessageEvent({ channel_id: '999' });
  t.mock.timers.tick(5000);
  assert.equal(reads, 0);
  drops.onMessageEvent({ channel_id: DROPS });
  drops.onMessageEvent({ channel_id: DROPS });
  t.mock.timers.tick(3000);
  assert.equal(reads, 1, 'two changes, one read');
});

test('config: DROPS_CHANNEL_ID is optional but must be an ID', () => {
  const env = {
    DISCORD_BOT_TOKEN: 't',
    SUPABASE_URL: 'https://x.supabase.co',
    SUPABASE_SECRET_KEY: 'sb_secret_x',
    DISCORD_GUILD_ID: '100000000000000001',
    DISCORD_CIRCLE_ROLE_ID: '200000000000000001',
    DISCORD_MOD_ROLE_ID: '200000000000000002',
    MARKET_CHANNEL_ID: '300000000000000001',
    VOUCH_CHANNEL_ID: '300000000000000002',
    REPORTS_CHANNEL_ID: '300000000000000003',
  };
  assert.equal(loadConfig(env).dropsChannelId, null);
  assert.equal(loadConfig({ ...env, DROPS_CHANNEL_ID: DROPS }).dropsChannelId, DROPS);
  assert.throws(() => loadConfig({ ...env, DROPS_CHANNEL_ID: '#upcoming-drops' }), (error) => error instanceof ConfigError && /DROPS_CHANNEL_ID/.test(error.message));
});
