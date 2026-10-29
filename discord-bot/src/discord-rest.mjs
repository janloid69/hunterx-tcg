// Discord's HTTP API: sending, editing and deleting messages, DMs, threads,
// the member list, and answering button presses. Waits out rate limits and
// retries Discord's own hiccups. No npm packages needed (Node 22+).

const API = 'https://discord.com/api/v10';
const USER_AGENT = 'DiscordBot (https://github.com/janloid69/hunterx-tcg, 1.0) HunterX';

/** Discord error codes the bot handles on purpose. */
export const DiscordCodes = {
  UNKNOWN_CHANNEL: 10003,
  UNKNOWN_MESSAGE: 10008,
  UNKNOWN_USER: 10013,
  MISSING_ACCESS: 50001,
  CANNOT_DM: 50007,
  MISSING_PERMISSIONS: 50013,
  THREAD_ARCHIVED: 50083,
};

export class DiscordError extends Error {
  constructor(status, code, message, method, path) {
    // Button-press paths carry a one-time token; keep it out of the logs.
    const shown = path.replace(/^\/(interactions\/\d+|webhooks\/\d+)\/[^/?]+/, '/$1/…');
    super(`Discord ${method} ${shown} failed (${status}${code ? `, code ${code}` : ''}): ${message}`);
    this.name = 'DiscordError';
    this.status = status;
    this.code = code;
  }

  get isGone() {
    return this.status === 404 || this.code === DiscordCodes.UNKNOWN_MESSAGE || this.code === DiscordCodes.UNKNOWN_CHANNEL;
  }

  get isPermission() {
    return this.code === DiscordCodes.MISSING_ACCESS || this.code === DiscordCodes.MISSING_PERMISSIONS || this.status === 403;
  }
}

const sleepFor = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Requests that share a Discord rate limit share a key (ids after the first are generic). */
export function routeKey(method, path) {
  let seenId = false;
  const generic = path
    .split('?')[0]
    .split('/')
    .map((part) => {
      if (!/^\d{15,}$/.test(part)) return part;
      if (!seenId) {
        seenId = true;
        return part;
      }
      return ':id';
    })
    .join('/');
  return `${method} ${generic}`;
}

export function createDiscordRest({ token, fetchImpl = fetch, sleep = sleepFor, log = () => {} }) {
  if (!token) throw new Error('A Discord bot token is required');
  const resetAt = new Map();
  let queue = Promise.resolve();
  const dmChannels = new Map();

  async function send(method, path, { body, auth = true, attempt = 0 } = {}) {
    const key = routeKey(method, path);
    const wait = (resetAt.get(key) ?? 0) - Date.now();
    if (wait > 0) await sleep(wait);

    const headers = { 'User-Agent': USER_AGENT };
    if (auth) headers.Authorization = `Bot ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    let res;
    try {
      res = await fetchImpl(`${API}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (cause) {
      if (attempt < 3) {
        await sleep(1000 * 2 ** attempt);
        return send(method, path, { body, auth, attempt: attempt + 1 });
      }
      throw new Error(`Can't reach Discord (${method} ${path}): ${cause.message}`);
    }

    if (res.headers.get('x-ratelimit-remaining') === '0') {
      const after = Number(res.headers.get('x-ratelimit-reset-after'));
      if (Number.isFinite(after) && after > 0) resetAt.set(key, Date.now() + after * 1000);
    }

    if (res.status === 429 && attempt < 5) {
      const data = await res.json().catch(() => ({}));
      const seconds = Number(data.retry_after ?? res.headers.get('retry-after') ?? 1);
      log(`Discord rate limit on ${key}, waiting ${seconds}s`);
      await sleep(Math.ceil((Number.isFinite(seconds) ? seconds : 1) * 1000) + 100);
      return send(method, path, { body, auth, attempt: attempt + 1 });
    }
    if (res.status >= 500 && attempt < 3) {
      await sleep(1000 * 2 ** attempt);
      return send(method, path, { body, auth, attempt: attempt + 1 });
    }

    const text = res.status === 204 ? '' : await res.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { message: text.slice(0, 200) };
      }
    }
    if (!res.ok) throw new DiscordError(res.status, data?.code, data?.message ?? res.statusText, method, path);
    return data;
  }

  /** Normal requests go one at a time, which keeps the bot well under Discord's limits. */
  function request(method, path, options = {}) {
    if (options.priority) return send(method, path, options);
    const run = queue.then(() => send(method, path, options));
    queue = run.catch(() => {});
    return run;
  }

  /** Never ping anyone unless the payload says exactly who. */
  const safe = (payload) => ({ allowed_mentions: { parse: [] }, ...payload });

  return {
    request,

    me: () => request('GET', '/users/@me'),
    gatewayUrl: async () => (await request('GET', '/gateway/bot')).url,
    getChannel: (channelId) => request('GET', `/channels/${channelId}`),

    sendMessage: (channelId, payload) => request('POST', `/channels/${channelId}/messages`, { body: safe(payload) }),
    editMessage: (channelId, messageId, payload) =>
      request('PATCH', `/channels/${channelId}/messages/${messageId}`, { body: safe(payload) }),
    deleteMessage: (channelId, messageId) => request('DELETE', `/channels/${channelId}/messages/${messageId}`),

    startThread: (channelId, messageId, name) =>
      request('POST', `/channels/${channelId}/messages/${messageId}/threads`, {
        body: { name, auto_archive_duration: 10080 },
      }),
    createForumPost: (channelId, name, payload) =>
      request('POST', `/channels/${channelId}/threads`, {
        body: { name, auto_archive_duration: 10080, message: safe(payload) },
      }),
    createTextChannel: (guildId, parentId, name) =>
      request('POST', `/guilds/${guildId}/channels`, { body: { name, type: 0, parent_id: parentId } }),
    editChannel: (channelId, body) => request('PATCH', `/channels/${channelId}`, { body }),

    /** Sends a DM. Returns null when the member can't get DMs from the bot. */
    async dm(userId, payload) {
      try {
        let channelId = dmChannels.get(userId);
        if (!channelId) {
          channelId = (await request('POST', '/users/@me/channels', { body: { recipient_id: userId } })).id;
          dmChannels.set(userId, channelId);
        }
        return await request('POST', `/channels/${channelId}/messages`, { body: safe(payload) });
      } catch (error) {
        if (error instanceof DiscordError && (error.code === DiscordCodes.CANNOT_DM || error.code === DiscordCodes.UNKNOWN_USER)) {
          return null;
        }
        throw error;
      }
    },

    /** The server's Discord events (scheduled, live, finished and cancelled). */
    listScheduledEvents: (guildId) => request('GET', `/guilds/${guildId}/scheduled-events?with_user_count=true`),

    /** The latest messages in a channel, newest first (up to 100). */
    listMessages: (channelId, limit = 50) =>
      request('GET', `/channels/${channelId}/messages?limit=${Math.min(100, Math.max(1, limit))}`),
    listRoles: (guildId) => request('GET', `/guilds/${guildId}/roles`),
    listGuildChannels: (guildId) => request('GET', `/guilds/${guildId}/channels`),

    /** Everyone in the server (people, not bots), 1000 at a time. */
    async listMembers(guildId) {
      const members = [];
      let after = '0';
      for (;;) {
        const page = await request('GET', `/guilds/${guildId}/members?limit=1000&after=${after}`);
        members.push(...page);
        if (page.length < 1000) break;
        after = page[page.length - 1].user.id;
      }
      return members.filter((member) => !member.user?.bot);
    },

    // Button presses must be answered within 3 seconds, so these skip the queue.
    interactionCallback: (interactionId, interactionToken, body) =>
      request('POST', `/interactions/${interactionId}/${interactionToken}/callback`, {
        body,
        auth: false,
        priority: true,
      }),
    editOriginal: (applicationId, interactionToken, payload) =>
      request('PATCH', `/webhooks/${applicationId}/${interactionToken}/messages/@original`, {
        body: safe(payload),
        auth: false,
        priority: true,
      }),
    followup: (applicationId, interactionToken, payload) =>
      request('POST', `/webhooks/${applicationId}/${interactionToken}`, {
        body: safe(payload),
        auth: false,
        priority: true,
      }),
  };
}
