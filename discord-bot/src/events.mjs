// Copies the HunterX server's upcoming Discord events (pull nights, meetups,
// giveaways) into the database, so the website's Community page can show them.

import { truncate } from './format.mjs';

const Status = { SCHEDULED: 1, ACTIVE: 2 };
const EntityType = { STAGE: 1, VOICE: 2, EXTERNAL: 3 };

/** A Discord scheduled event -> a community_events row. */
export function mapEvent(event, channelNames = new Map(), now = new Date().toISOString()) {
  let location = null;
  if (event.entity_type === EntityType.EXTERNAL) {
    location = event.entity_metadata?.location ? truncate(event.entity_metadata.location, 200) : null;
  } else if (event.channel_id) {
    const kind = event.entity_type === EntityType.STAGE ? 'Stage' : 'Voice';
    const name = channelNames.get(event.channel_id);
    location = name ? `${kind}: ${name}` : 'On Discord';
  }
  return {
    id: event.id,
    name: truncate(event.name, 200),
    description: event.description ? truncate(event.description, 1000) : null,
    starts_at: event.scheduled_start_time,
    ends_at: event.scheduled_end_time ?? null,
    location,
    image_url: event.image ? `https://cdn.discordapp.com/guild-events/${event.id}/${event.image}.png?size=1024` : null,
    interested: Number.isFinite(event.user_count) ? event.user_count : null,
    status: event.status === Status.ACTIVE ? 'active' : 'scheduled',
    url: `https://discord.com/events/${event.guild_id}/${event.id}`,
    updated_at: now,
  };
}

export function createEventSync({ store, discord, config, log = () => {} }) {
  const channelNames = new Map();
  let lastSeen = null;

  async function sync() {
    const all = await discord.listScheduledEvents(config.guildId);
    const upcoming = all.filter((event) => event.status === Status.SCHEDULED || event.status === Status.ACTIVE);
    for (const event of upcoming) {
      if (!event.channel_id || channelNames.has(event.channel_id)) continue;
      try {
        channelNames.set(event.channel_id, (await discord.getChannel(event.channel_id)).name ?? null);
      } catch {
        channelNames.set(event.channel_id, null);
      }
    }
    const rows = upcoming.map((event) => mapEvent(event, channelNames));
    await store.saveEvents(rows);
    const seen = rows.map((row) => row.id).sort().join(',');
    if (seen !== lastSeen) {
      log(`Server events: ${rows.length} upcoming${rows.length ? ` (${rows.map((row) => row.name).join(', ')})` : ''}`);
      lastSeen = seen;
    }
    return rows.length;
  }

  return { sync };
}
