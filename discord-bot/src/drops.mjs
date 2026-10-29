// Copies the latest posts from the server's #upcoming-drops channel into the
// database, so the website's Community page can show them.
//
// Reads the channel every two minutes, and right away when something is
// posted, edited or deleted there. Discord only shares message text with bots
// that have "Message Content Intent" turned on in the Developer Portal.

import { truncate } from './format.mjs';

const KEEP = 50;
const MessageType = { DEFAULT: 0, REPLY: 19 };
const NAME_CACHE_MS = 60 * 60_000;

/** Discord's own avatar, or its default one for people without a picture. */
export function avatarUrl(user) {
  if (!user?.id) return null;
  if (user.avatar) return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64`;
  const index = Number((BigInt(user.id) >> 22n) % 6n);
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

const displayName = (user) => user?.global_name || user?.username || 'Someone';

const manila = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Manila',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});
const manilaDate = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' });

/**
 * Discord's codes in message text -> what people see in the app:
 * <@&role> -> @Pokemon, <#channel> -> #pokemon, <@user> -> @name,
 * <:emoji:id> -> :emoji:, <t:1700000000:F> -> a Philippine date and time.
 */
export function readableText(content, { roles = new Map(), channels = new Map(), users = new Map() } = {}) {
  return String(content ?? '')
    .replace(/<@&(\d+)>/g, (_, id) => `@${roles.get(id) ?? 'role'}`)
    .replace(/<#(\d+)>/g, (_, id) => `#${channels.get(id) ?? 'channel'}`)
    .replace(/<@!?(\d+)>/g, (_, id) => `@${users.get(id) ?? 'someone'}`)
    .replace(/<a?:(\w+):\d+>/g, (_, name) => `:${name}:`)
    .replace(/<t:(-?\d+)(?::([tTdDfFR]))?>/g, (_, seconds, style) => {
      const date = new Date(Number(seconds) * 1000);
      if (Number.isNaN(date.getTime())) return '';
      return style === 'd' || style === 'D' ? manilaDate.format(date) : manila.format(date);
    })
    .replace(/<\/([\w -]+):\d+>/g, (_, name) => `/${name}`)
    .trim();
}

function mentionedUsers(message) {
  return new Map((message.mentions ?? []).map((user) => [user.id, user.member?.nick || displayName(user)]));
}

function mediaKind(attachment) {
  const type = String(attachment.content_type ?? '');
  if (type.startsWith('image/') || /\.(png|jpe?g|gif|webp)$/i.test(attachment.filename ?? '')) return 'image';
  if (type.startsWith('video/')) return 'video';
  return 'file';
}

/** A Discord message -> a community_drops row, or null for ones not worth showing. */
export function mapDrop(message, { guildId, roles, channels, now = new Date().toISOString() }) {
  if (message.type !== MessageType.DEFAULT && message.type !== MessageType.REPLY) return null;
  const names = { roles, channels, users: mentionedUsers(message) };
  const content = truncate(readableText(message.content, names), 2000);
  const attachments = (message.attachments ?? [])
    .map((attachment) => ({
      url: attachment.url,
      kind: mediaKind(attachment),
      name: attachment.filename ?? null,
      width: attachment.width ?? null,
      height: attachment.height ?? null,
    }))
    .filter((attachment) => attachment.url);
  if (!content && attachments.length === 0) return null;

  const replied = message.referenced_message;
  const reply =
    message.type === MessageType.REPLY && replied
      ? {
          author: displayName(replied.author),
          content: truncate(readableText(replied.content, { roles, channels, users: mentionedUsers(replied) }).replace(/\s+/g, ' '), 140),
        }
      : null;

  return {
    id: message.id,
    author_name: truncate(message.member?.nick || displayName(message.author), 80),
    author_avatar: avatarUrl(message.author),
    content,
    attachments,
    reply,
    posted_at: message.timestamp,
    edited_at: message.edited_timestamp ?? null,
    url: `https://discord.com/channels/${guildId}/${message.channel_id}/${message.id}`,
    updated_at: now,
  };
}

export function createDropSync({ store, discord, config, log = () => {}, now = () => Date.now() }) {
  let names = null;
  let namesAt = 0;
  let lastSeen = null;
  let warnedNoText = false;
  let timer = null;

  async function loadNames() {
    if (names && now() - namesAt < NAME_CACHE_MS) return names;
    const [roles, channels] = await Promise.all([
      discord.listRoles(config.guildId).catch(() => []),
      discord.listGuildChannels(config.guildId).catch(() => []),
    ]);
    names = {
      roles: new Map(roles.map((role) => [role.id, role.name])),
      channels: new Map(channels.map((channel) => [channel.id, channel.name])),
    };
    namesAt = now();
    return names;
  }

  async function sync() {
    if (!config.dropsChannelId) return 0;
    const messages = await discord.listMessages(config.dropsChannelId, KEEP);
    const { roles, channels } = await loadNames();
    const rows = messages
      .map((message) => mapDrop(message, { guildId: config.guildId, roles, channels }))
      .filter(Boolean);

    // Without Message Content Intent, Discord sends the posts with no text.
    const textless = messages.length > 0 && messages.every((message) => !message.content && !(message.attachments ?? []).length && !(message.embeds ?? []).length);
    if (textless && !warnedNoText) {
      log('Drops: Discord sent the #upcoming-drops posts without their text. Turn on "Message Content Intent" (Developer Portal → your app → Bot), then restart the bot.');
      warnedNoText = true;
      return 0;
    }
    if (textless) return 0;

    await store.saveDrops(rows);
    const seen = rows.map((row) => `${row.id}:${row.edited_at ?? ''}`).join(',');
    if (seen !== lastSeen) {
      log(`Drops: ${rows.length} post${rows.length === 1 ? '' : 's'} on the website${rows[0] ? ` (newest by ${rows[0].author_name})` : ''}`);
      lastSeen = seen;
    }
    return rows.length;
  }

  /** Re-read the channel a few seconds after a post there changes (several changes, one read). */
  function soon(run = sync, delayMs = 3000) {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      run().catch((error) => log(`Copying drops failed: ${error.message}`));
    }, delayMs);
  }

  /** Gateway events: MESSAGE_CREATE / MESSAGE_UPDATE / MESSAGE_DELETE. */
  function onMessageEvent(data) {
    if (config.dropsChannelId && data?.channel_id === config.dropsChannelId) soon();
  }

  return { sync, onMessageEvent, soon };
}
