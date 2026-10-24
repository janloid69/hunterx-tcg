import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createEventSync, mapEvent } from '../src/events.mjs';
import { fakeDiscord, fakeStore } from './fakes.mjs';
import { config } from './fixtures.mjs';

const voiceEvent = {
  id: '1600000000000000001',
  guild_id: config.guildId,
  channel_id: '1600000000000000100',
  name: 'Pull night: Prismatic Evolutions',
  description: 'Open packs together, giveaways at 10 PM',
  scheduled_start_time: '2026-10-30T12:00:00+00:00',
  scheduled_end_time: null,
  status: 1,
  entity_type: 2,
  entity_metadata: null,
  user_count: 23,
  image: 'abc123',
};

test('a voice event becomes a Community page row', () => {
  const row = mapEvent(voiceEvent, new Map([['1600000000000000100', 'pull-night-vc']]), 'NOW');
  assert.deepEqual(row, {
    id: '1600000000000000001',
    name: 'Pull night: Prismatic Evolutions',
    description: 'Open packs together, giveaways at 10 PM',
    starts_at: '2026-10-30T12:00:00+00:00',
    ends_at: null,
    location: 'Voice: pull-night-vc',
    image_url: 'https://cdn.discordapp.com/guild-events/1600000000000000001/abc123.png?size=1024',
    interested: 23,
    status: 'scheduled',
    url: `https://discord.com/events/${config.guildId}/1600000000000000001`,
    updated_at: 'NOW',
  });
});

test('meetups show their place; live events are active', () => {
  const row = mapEvent({ ...voiceEvent, channel_id: null, entity_type: 3, entity_metadata: { location: 'SM Megamall, 3F' }, status: 2, image: null });
  assert.equal(row.location, 'SM Megamall, 3F');
  assert.equal(row.status, 'active');
  assert.equal(row.image_url, null);
});

test('sync keeps only upcoming and live events, and looks up channel names once', async () => {
  const store = fakeStore();
  const discord = fakeDiscord();
  let channelLookups = 0;
  discord.getChannel = async (id) => {
    channelLookups += 1;
    return { id, name: 'pull-night-vc' };
  };
  discord.listScheduledEvents = async () => [
    voiceEvent,
    { ...voiceEvent, id: '1600000000000000002', status: 3 }, // finished
    { ...voiceEvent, id: '1600000000000000003', status: 4 }, // cancelled
    { ...voiceEvent, id: '1600000000000000004', status: 2 }, // live now
  ];
  const sync = createEventSync({ store, discord, config });
  assert.equal(await sync.sync(), 2);
  await sync.sync();
  const saved = store.calls.filter((call) => call[0] === 'saveEvents');
  assert.deepEqual(saved[0][1].map((row) => row.id), ['1600000000000000001', '1600000000000000004']);
  assert.equal(channelLookups, 1);
});
