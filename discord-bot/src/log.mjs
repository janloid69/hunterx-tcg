// Writes what the bot does to the screen and to logs/bot-YYYY-MM-DD.log,
// keeping two weeks of files.

import { appendFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';

const pad = (n) => String(n).padStart(2, '0');
const day = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const clock = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

export function createLogger({ dir, keepDays = 14, now = () => new Date(), toConsole = true } = {}) {
  let canWrite = Boolean(dir);
  if (canWrite) {
    try {
      mkdirSync(dir, { recursive: true });
    } catch {
      canWrite = false;
    }
  }

  function prune() {
    if (!canWrite) return;
    const cutoff = day(new Date(now().getTime() - keepDays * 86_400_000));
    for (const name of readdirSync(dir)) {
      const match = name.match(/^bot-(\d{4}-\d{2}-\d{2})\.log$/);
      if (match && match[1] < cutoff) rmSync(path.join(dir, name), { force: true });
    }
  }

  function log(message) {
    const at = now();
    const line = `[${day(at)} ${clock(at)}] ${message}`;
    if (toConsole) console.log(line);
    if (canWrite) {
      try {
        appendFileSync(path.join(dir, `bot-${day(at)}.log`), `${line}\n`);
      } catch {
        // a full disk shouldn't stop the bot
      }
    }
  }

  try {
    prune();
  } catch {
    // ignore
  }
  log.prune = prune;
  return log;
}
