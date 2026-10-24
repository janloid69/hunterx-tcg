import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createInteractions } from '../src/interactions.mjs';
import { createRoleSync } from '../src/roles.mjs';
import { createWorker } from '../src/worker.mjs';
import { fakeDiscord, fakeStore } from './fakes.mjs';
import { config, report } from './fixtures.mjs';

function press(customId, roles = [config.modRoleId], guildId = config.guildId) {
  return {
    id: '700000000000000001',
    token: 'interaction-token',
    type: 3,
    application_id: '800000000000000001',
    guild_id: guildId,
    data: { custom_id: customId },
    member: { roles, nick: null, user: { id: '400000000000000003', username: 'modmae' } },
  };
}

test('mods press Resolve: acknowledged, saved as them, ticket refreshed', async () => {
  const store = fakeStore({ reports: { r1: report({ id: 'r1', status: 'resolved' }) } });
  const discord = fakeDiscord();
  const onInteraction = createInteractions({ store, discord, config });
  await onInteraction(press('hx:report:resolve:r1'));

  assert.deepEqual(discord.calls[0], ['interactionCallback', '700000000000000001', 'interaction-token', { type: 6 }]);
  assert.deepEqual(store.calls[0], ['moderate', '400000000000000003', 'r1', 'resolve']);
  const [, appId, token, payload] = discord.named('editOriginal')[0];
  assert.equal(appId, '800000000000000001');
  assert.equal(token, 'interaction-token');
  assert.deepEqual(payload.components[0].components.map((b) => b.label), ['Reopen', 'Hide listing', 'Reports page']);
});

test('non-mods get a private "mods only" reply and nothing changes', async () => {
  const store = fakeStore();
  const discord = fakeDiscord();
  const onInteraction = createInteractions({ store, discord, config });
  await onInteraction(press('hx:report:hide:r1', ['someotherrole']));
  const [[, , , body]] = discord.named('interactionCallback');
  assert.equal(body.type, 4);
  assert.equal(body.data.flags, 64);
  assert.equal(store.calls.length, 0);
});

test('a mod without a HunterX account is told how to fix it', async () => {
  const error = Object.assign(new Error('fail'), {
    detail: 'No HunterX mod account for this Discord user',
    hint: 'Sign in to the HunterX website once with Discord, then try again.',
  });
  const store = fakeStore({ moderateError: error });
  const discord = fakeDiscord();
  await createInteractions({ store, discord, config })(press('hx:report:dismiss:r1'));
  const [[, , , payload]] = discord.named('followup');
  assert.equal(payload.flags, 64);
  assert.match(payload.content, /Sign in to the HunterX website once/);
  assert.equal(discord.named('editOriginal').length, 0);
});

test('other buttons and odd ids are ignored', async () => {
  const store = fakeStore();
  const discord = fakeDiscord();
  const onInteraction = createInteractions({ store, discord, config });
  await onInteraction(press('someone-else:button'));
  await onInteraction(press('hx:report:delete-everything:r1'));
  await onInteraction({ type: 2, data: { name: 'slash' } });
  assert.equal(discord.calls.length, 0);
});

test('role sync: member events and the full check', async () => {
  const store = fakeStore({ syncChanged: 2 });
  const discord = fakeDiscord();
  discord.listMembers = async () => [
    { user: { id: '1' }, roles: [config.circleRoleId] },
    { user: { id: '2' }, roles: [] },
  ];
  const logs = [];
  const roles = createRoleSync({ store, discord, config, log: (m) => logs.push(m) });

  await roles.onMemberEvent('GUILD_MEMBER_UPDATE', { guild_id: config.guildId, user: { id: '1', username: 'a' }, roles: [config.circleRoleId] });
  await roles.onMemberEvent('GUILD_MEMBER_REMOVE', { guild_id: config.guildId, user: { id: '2', username: 'b' } });
  await roles.onMemberEvent('GUILD_MEMBER_UPDATE', { guild_id: 'another-server', user: { id: '3' }, roles: [] });
  await roles.onMemberEvent('GUILD_MEMBER_UPDATE', { guild_id: config.guildId, user: { id: '4', bot: true }, roles: [] });
  await Promise.all([roles.fullSync(), roles.fullSync()]);

  const syncs = store.calls.filter((call) => call[0] === 'syncRoles').map((call) => call[1]);
  assert.equal(syncs.length, 3, 'two member events + one full check (the second waited for the first)');
  assert.deepEqual(syncs[0].members, [{ id: '1', roles: [config.circleRoleId] }]);
  assert.deepEqual(syncs[1].left, ['2']);
  assert.equal(syncs[2].full, true);
  assert.equal(syncs[2].members.length, 2);
  assert.equal(syncs[2].circleRoleId, config.circleRoleId);
  assert.match(logs.at(-1), /2 server members, 2 HunterX profiles updated/);
});

test('worker finishes good events and schedules retries for failed ones', async () => {
  const finished = [];
  const store = {
    nextEvents: async () => [
      { id: 2, kind: 'vouch', event: 'created', ref_id: 'v2', attempts: 1 },
      { id: 1, kind: 'listing', event: 'created', ref_id: 'l1', attempts: 1 },
    ],
    finishEvent: async (id, error = null) => finished.push([id, error]),
  };
  const order = [];
  const handlers = {
    handle: async (event) => {
      order.push(event.id);
      if (event.kind === 'vouch') throw new Error('Discord is down');
    },
  };
  const worker = createWorker({ store, handlers, log: () => {} });
  assert.equal(await worker.runOnce(), 2);
  assert.deepEqual(order, [1, 2], 'oldest first');
  assert.deepEqual(finished, [[1, null], [2, 'Discord is down']]);
});
