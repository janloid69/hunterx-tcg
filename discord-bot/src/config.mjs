// Reads the bot's settings from .env and checks them before anything starts,
// so setup mistakes come with a clear fix instead of a crash later.

export class ConfigError extends Error {}

const SNOWFLAKE = /^\d{15,25}$/;

const IDS = {
  DISCORD_GUILD_ID: 'the HunterX server ID',
  DISCORD_CIRCLE_ROLE_ID: 'the hunterxcircle role ID',
  DISCORD_MOD_ROLE_ID: 'the Support Mod role ID',
  MARKET_CHANNEL_ID: 'the channel for new listings',
  VOUCH_CHANNEL_ID: 'the channel for vouches',
  REPORTS_CHANNEL_ID: 'the mod-only channel for report tickets',
};

function number(value, fallback, { min, max }) {
  const parsed = Number(value);
  if (value === undefined || value === '' || !Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function loadConfig(env = process.env) {
  const problems = [];
  const value = (name) => String(env[name] ?? '').trim();

  const token = value('DISCORD_BOT_TOKEN');
  if (!token) problems.push('DISCORD_BOT_TOKEN is empty. Paste the bot token from the Discord Developer Portal (your app → Bot).');

  const supabaseUrl = value('SUPABASE_URL').replace(/\/$/, '');
  if (!/^https:\/\/.+/.test(supabaseUrl)) problems.push('SUPABASE_URL should look like https://xxxx.supabase.co');

  const secretKey = value('SUPABASE_SECRET_KEY') || value('SUPABASE_SERVICE_ROLE_KEY');
  if (!secretKey) {
    problems.push('SUPABASE_SECRET_KEY is empty. Copy a secret key (starts with sb_secret_) from Supabase → Project Settings → API Keys.');
  } else if (secretKey.startsWith('sb_publishable_')) {
    problems.push('SUPABASE_SECRET_KEY has the publishable key. The bot needs a secret key (starts with sb_secret_).');
  }

  const ids = {};
  for (const [name, what] of Object.entries(IDS)) {
    ids[name] = value(name);
    if (!SNOWFLAKE.test(ids[name])) problems.push(`${name} should be ${what} (a long number from Discord's Copy ID).`);
  }

  // Optional: the channel whose posts appear as "Upcoming drops" on the website.
  const dropsChannelId = value('DROPS_CHANNEL_ID');
  if (dropsChannelId && !SNOWFLAKE.test(dropsChannelId)) {
    problems.push("DROPS_CHANNEL_ID should be the #upcoming-drops channel ID (a long number from Discord's Copy ID), or empty.");
  }

  if (problems.length) {
    throw new ConfigError(`The bot's settings in .env need fixing:\n  - ${problems.join('\n  - ')}`);
  }

  return {
    token,
    supabaseUrl,
    secretKey,
    guildId: ids.DISCORD_GUILD_ID,
    circleRoleId: ids.DISCORD_CIRCLE_ROLE_ID,
    modRoleId: ids.DISCORD_MOD_ROLE_ID,
    marketChannelId: ids.MARKET_CHANNEL_ID,
    vouchChannelId: ids.VOUCH_CHANNEL_ID,
    reportsChannelId: ids.REPORTS_CHANNEL_ID,
    dropsChannelId: dropsChannelId || null,
    siteUrl: (value('SITE_URL') || 'https://hunterx-tcg.netlify.app').replace(/\/$/, ''),
    pollMs: number(env.POLL_SECONDS, 5, { min: 2, max: 300 }) * 1000,
    dmCooldownMs: number(env.DM_COOLDOWN_MINUTES, 10, { min: 0, max: 1440 }) * 60_000,
    roleSyncMs: number(env.ROLE_SYNC_HOURS, 6, { min: 1, max: 168 }) * 3_600_000,
    logDir: value('LOG_DIR') || 'logs',
  };
}
