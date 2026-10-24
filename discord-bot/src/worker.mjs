// Picks up website events from the database every few seconds and hands them
// to the handlers. Failed events are retried later by the database (2, 4, 8 ...
// up to 60 minutes apart, 10 tries).

import { DiscordError } from './discord-rest.mjs';

const BATCH = 20;
const sleepFor = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function explain(error) {
  if (error instanceof DiscordError && error.isPermission) {
    return `${error.message}. Check the bot's permissions in the market, vouch and reports channels (see discord-bot/README.md).`;
  }
  return error.message;
}

export function createWorker({ store, handlers, log = () => {}, pollMs = 5000, sleep = sleepFor }) {
  let running = false;

  async function runOnce() {
    const events = [...((await store.nextEvents(BATCH)) ?? [])].sort((a, b) => a.id - b.id);
    for (const event of events) {
      try {
        await handlers.handle(event);
        await store.finishEvent(event.id);
      } catch (error) {
        const message = explain(error);
        log(`Couldn't handle ${event.kind} ${event.event} (${String(event.ref_id).slice(0, 8)}, try ${event.attempts} of 10): ${message}`);
        await store.finishEvent(event.id, message).catch((finishError) => {
          log(`Couldn't schedule a retry: ${finishError.message}`);
        });
      }
    }
    return events.length;
  }

  async function loop() {
    while (running) {
      let handled = 0;
      try {
        handled = await runOnce();
      } catch (error) {
        log(`Couldn't read events from Supabase: ${error.message}`);
      }
      if (running && handled < BATCH) {
        await sleep(pollMs);
      }
    }
  }

  return {
    runOnce,
    start() {
      if (running) return;
      running = true;
      loop();
    },
    stop() {
      running = false;
    },
  };
}
