// In-memory stand-ins for the database and Discord, recording what the bot does.

import { DiscordError } from '../src/discord-rest.mjs';

export function fakeStore(data = {}) {
  const posts = new Map();
  const calls = [];
  const key = (kind, id) => `${kind}:${id}`;
  return {
    data,
    posts,
    calls,
    listing: async (id) => data.listings?.[id] ?? null,
    memberStats: async (id) => data.stats?.[id] ?? null,
    message: async (id) => data.messages?.[id] ?? null,
    people: async (ids) => new Map(ids.map((id) => [id, data.people?.[id]]).filter(([, p]) => p)),
    vouch: async (id) => data.vouches?.[id] ?? null,
    report: async (id) => data.reports?.[id] ?? null,
    getPost: async (kind, id) => posts.get(key(kind, id)) ?? null,
    putPost: async (kind, id, fields) => {
      posts.set(key(kind, id), { kind, ref_id: id, ...(posts.get(key(kind, id)) ?? {}), ...fields });
    },
    removePost: async (kind, id) => {
      posts.delete(key(kind, id));
    },
    moderate: async (...args) => {
      calls.push(['moderate', ...args]);
      if (data.moderateError) throw data.moderateError;
    },
    saveEvents: async (rows) => {
      calls.push(['saveEvents', rows]);
    },
    saveDrops: async (rows) => {
      calls.push(['saveDrops', rows]);
    },
    syncRoles: async (args) => {
      calls.push(['syncRoles', args]);
      return data.syncChanged ?? 1;
    },
  };
}

export function fakeDiscord({ failEdits = null, closedDms = [] } = {}) {
  const calls = [];
  let nextId = 900000000000000000n;
  const id = () => String((nextId += 1n));
  const record = (name, ...args) => {
    calls.push([name, ...args]);
  };
  return {
    calls,
    named: (name) => calls.filter((call) => call[0] === name),
    sendMessage: async (channelId, payload) => {
      record('sendMessage', channelId, payload);
      return { id: id(), channel_id: channelId };
    },
    editMessage: async (channelId, messageId, payload) => {
      record('editMessage', channelId, messageId, payload);
      if (failEdits) {
        const error = failEdits;
        failEdits = null;
        throw error;
      }
    },
    deleteMessage: async (channelId, messageId) => record('deleteMessage', channelId, messageId),
    startThread: async (channelId, messageId, name) => {
      record('startThread', channelId, messageId, name);
      return { id: id() };
    },
    createForumPost: async (channelId, name, payload) => {
      record('createForumPost', channelId, name, payload);
      const threadId = id();
      return { id: threadId, message: { id: threadId } };
    },
    createTextChannel: async (guildId, parentId, name) => {
      record('createTextChannel', guildId, parentId, name);
      return { id: id() };
    },
    editChannel: async (channelId, body) => record('editChannel', channelId, body),
    dm: async (userId, payload) => {
      record('dm', userId, payload);
      return closedDms.includes(userId) ? null : { id: id() };
    },
    listMembers: async () => [],
    listScheduledEvents: async () => [],
    listMessages: async () => [],
    listRoles: async () => [],
    listGuildChannels: async () => [],
    getChannel: async (channelId) => ({ id: channelId, name: 'pull-night-vc' }),
    interactionCallback: async (...args) => record('interactionCallback', ...args),
    editOriginal: async (...args) => record('editOriginal', ...args),
    followup: async (...args) => record('followup', ...args),
  };
}

export const gone = () => new DiscordError(404, 10008, 'Unknown Message', 'PATCH', '/channels/1/messages/2');
