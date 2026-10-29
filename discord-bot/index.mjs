// HunterX Discord bot. Start it with:  node --env-file=.env index.mjs
// (start-bot.cmd does this on Windows and restarts it if it ever stops).
//
// Exit codes: 0 stopped on purpose, 1 crashed (safe to restart),
// 2 settings need fixing (restarting won't help; see the log).

import { rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { ConfigError, loadConfig } from './src/config.mjs';
import { createDb } from './src/db.mjs';
import { createDiscordRest, DiscordError } from './src/discord-rest.mjs';
import { createDropSync } from './src/drops.mjs';
import { createEventSync } from './src/events.mjs';
import { createGateway, Intents } from './src/gateway.mjs';
import { createHandlers } from './src/handlers.mjs';
import { createInteractions } from './src/interactions.mjs';
import { createLogger } from './src/log.mjs';
import { createRoleSync } from './src/roles.mjs';
import { createStore } from './src/store.mjs';
import { createWorker } from './src/worker.mjs';

const ChannelType = { TEXT: 0, CATEGORY: 4, ANNOUNCEMENT: 5, FORUM: 15 };
const DAY = 86_400_000;

const log = createLogger({ dir: path.resolve(import.meta.dirname, process.env.LOG_DIR || 'logs') });

function stop(code, message) {
  if (message) log(message);
  // Give the log a moment to reach the disk and the screen.
  setTimeout(() => process.exit(code), 200);
}

async function checkChannel(discord, config, id, label, okTypes) {
  try {
    const channel = await discord.getChannel(id);
    if (channel.guild_id !== config.guildId) {
      log(`WARNING: the ${label} channel (${id}) isn't in the HunterX server.`);
    } else if (okTypes && !okTypes.includes(channel.type)) {
      log(`WARNING: the ${label} channel (#${channel.name}) should be a normal text channel.`);
    } else {
      log(`The ${label} channel is #${channel.name}`);
    }
    return channel;
  } catch (error) {
    const why =
      error instanceof DiscordError && (error.isPermission || error.isGone)
        ? 'the bot can\'t see it. Check the channel ID, and give the bot "View Channel" there.'
        : error.message;
    log(`WARNING: can't open the ${label} channel (${id}): ${why}`);
    return null;
  }
}

function reportsModeFor(channel) {
  if (channel?.type === ChannelType.FORUM) return 'forum';
  if (channel?.type === ChannelType.CATEGORY) return 'category';
  return 'thread';
}

async function main() {
  let config;
  try {
    config = loadConfig();
  } catch (error) {
    if (error instanceof ConfigError) return stop(2, error.message);
    throw error;
  }

  const discord = createDiscordRest({ token: config.token, log });
  const store = createStore(createDb({ url: config.supabaseUrl, secretKey: config.secretKey }));

  // 1. Is the Discord token right?
  try {
    const me = await discord.me();
    log(`Signed in to Discord as ${me.username}`);
  } catch (error) {
    if (error instanceof DiscordError && error.status === 401) {
      return stop(2, 'Discord rejected DISCORD_BOT_TOKEN. Copy a fresh token from the Developer Portal (your app → Bot → Reset Token) into .env.');
    }
    throw error;
  }

  // 2. Is the Supabase key right, and is the bot's migration in?
  try {
    await store.nextEvents(0);
    log('Connected to Supabase');
  } catch (error) {
    if (error.status === 401 || error.status === 403) {
      return stop(2, 'Supabase rejected SUPABASE_SECRET_KEY. Copy a secret key (sb_secret_...) from Supabase → Project Settings → API Keys into .env.');
    }
    if (error.status === 404 || error.code === 'PGRST202') {
      return stop(2, 'The bot\'s database functions are missing. Run supabase/migrations/20261025000000_discord_bot.sql in the Supabase SQL Editor, then start the bot again.');
    }
    throw error;
  }

  // 3. Can it see the channels?
  const textTypes = [ChannelType.TEXT, ChannelType.ANNOUNCEMENT];
  await checkChannel(discord, config, config.marketChannelId, 'market', textTypes);
  await checkChannel(discord, config, config.vouchChannelId, 'vouch', textTypes);
  if (config.dropsChannelId) {
    await checkChannel(discord, config, config.dropsChannelId, 'drops', textTypes);
  } else {
    log('Drops: no DROPS_CHANNEL_ID in .env, so the website shows no drops.');
  }
  const reportsChannel = await checkChannel(discord, config, config.reportsChannelId, 'reports', [
    ...textTypes,
    ChannelType.FORUM,
    ChannelType.CATEGORY,
  ]);
  const reportsMode = reportsModeFor(reportsChannel);
  log(
    {
      thread: 'Report tickets: a message with a thread in the reports channel',
      forum: 'Report tickets: a forum post each',
      category: 'Report tickets: a new channel each, in the reports category (the bot needs "Manage Channels" there)',
    }[reportsMode],
  );

  const handlers = createHandlers({ store, discord, config, log, reportsMode });
  const roles = createRoleSync({ store, discord, config, log });
  const events = createEventSync({ store, discord, config, log });
  const drops = createDropSync({ store, discord, config, log });
  const onInteraction = createInteractions({ store, discord, config, log });
  const worker = createWorker({ store, handlers, log, pollMs: config.pollMs });

  const safely = (what, promise) =>
    promise.catch((error) => log(`${what} failed: ${error.message}`));

  const gateway = createGateway({
    token: config.token,
    intents: Intents.GUILDS | Intents.GUILD_MEMBERS | (config.dropsChannelId ? Intents.GUILD_MESSAGES : 0),
    getGatewayUrl: discord.gatewayUrl,
    presence: {
      activities: [{ name: 'the HunterX market', type: 3 }],
      status: 'online',
      since: null,
      afk: false,
    },
    log,
    onFatal: (_code, message) => stop(2, message),
    onDispatch: (type, data) => {
      switch (type) {
        case 'READY':
          log('Connected to the Discord gateway');
          safely('Role check', roles.fullSync());
          safely('Copying server events', events.sync());
          safely('Copying drops', drops.sync());
          break;
        case 'RESUMED':
          log('Reconnected to the Discord gateway');
          break;
        case 'GUILD_MEMBER_ADD':
        case 'GUILD_MEMBER_UPDATE':
        case 'GUILD_MEMBER_REMOVE':
          safely('Updating member badges', roles.onMemberEvent(type, data));
          break;
        case 'MESSAGE_CREATE':
        case 'MESSAGE_UPDATE':
        case 'MESSAGE_DELETE':
          drops.onMessageEvent(data);
          break;
        case 'INTERACTION_CREATE':
          safely('Handling a button', onInteraction(data));
          break;
        default:
          break;
      }
    },
  });

  gateway.start();
  worker.start();
  log('HunterX bot is running');

  // restart-bot.ps1 uses this to restart just the bot after an update.
  const pidFile = path.join(import.meta.dirname, 'bot.pid');
  writeFileSync(pidFile, String(process.pid));
  process.once('exit', () => rmSync(pidFile, { force: true }));

  const timers = [
    setInterval(() => safely('Role check', roles.fullSync()), config.roleSyncMs),
    setInterval(() => safely('Copying server events', events.sync()), 15 * 60_000),
    setInterval(() => safely('Copying drops', drops.sync()), 2 * 60_000),
    setInterval(() => {
      safely('Cleanup', store.cleanup());
      log.prune();
    }, DAY),
  ];

  const shutdown = (signal) => {
    log(`Stopping (${signal})`);
    timers.forEach(clearInterval);
    worker.stop();
    gateway.stop();
    stop(0);
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

process.on('unhandledRejection', (error) => {
  log(`Unexpected error: ${error?.stack ?? error}`);
});

main().catch((error) => stop(1, `The bot stopped because of an error: ${error?.stack ?? error}`));
