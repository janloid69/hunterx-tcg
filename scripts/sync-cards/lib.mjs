// Shared helpers for the card sync: HTTP with retries, Supabase REST writes,
// and small parsing helpers. No npm packages needed (Node 22+).

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Returns a function that waits so calls are at least `ms` apart (API rate limits). */
export function createThrottle(ms) {
  let last = 0;
  return async () => {
    const wait = last + ms - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
  };
}

// Card APIs see who is asking, so the sync names itself and how to reach us.
export const USER_AGENT =
  'HunterX-TCG-CardSync/1.0 (+https://hunterx-tcg.pages.dev; github.com/janloid69/hunterx-tcg)';

/** GET a JSON URL, retrying on rate limits and server errors. */
export async function getJson(url, { headers = {}, retries = 4 } = {}) {
  for (let attempt = 0; ; attempt += 1) {
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': USER_AGENT, ...headers },
    });
    if (res.ok) return res.json();
    const retriable = res.status === 429 || res.status >= 500;
    if (!retriable || attempt >= retries) {
      const body = await res.text().catch(() => '');
      throw new Error(`GET ${url} failed with ${res.status}: ${body.slice(0, 200)}`);
    }
    const retryAfter = Number(res.headers.get('retry-after'));
    await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt);
  }
}

/** Minimal Supabase REST client using the service role (server-side only). */
export function createDb({ url, serviceKey }) {
  if (!url || !serviceKey) {
    throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to run the card sync.');
  }
  const base = `${url.replace(/\/$/, '')}/rest/v1`;
  const headers = { apikey: serviceKey, 'Content-Type': 'application/json' };
  // Legacy service_role keys are JWTs and also go in Authorization.
  if (serviceKey.startsWith('eyJ')) headers.Authorization = `Bearer ${serviceKey}`;

  return {
    async select(table, query) {
      const res = await fetch(`${base}/${table}?${query}`, { headers });
      if (!res.ok) throw new Error(`select ${table} failed: ${res.status} ${await res.text()}`);
      return res.json();
    },
    /** Number of rows matching a PostgREST filter, e.g. count('cards', 'game_id=eq.pokemon'). */
    async count(table, filter) {
      const res = await fetch(`${base}/${table}?select=id&${filter}`, {
        method: 'HEAD',
        headers: { ...headers, Prefer: 'count=exact' },
      });
      if (!res.ok) throw new Error(`count ${table} failed: ${res.status}`);
      const total = Number((res.headers.get('content-range') ?? '').split('/')[1]);
      return Number.isFinite(total) ? total : null;
    },
    /** True when the table has the column (false before a migration that adds it). */
    async hasColumn(table, column) {
      const res = await fetch(`${base}/${table}?select=${column}&limit=1`, { headers });
      if (res.ok) return true;
      if (res.status === 400) return false;
      throw new Error(`checking ${table}.${column} failed: ${res.status} ${await res.text()}`);
    },
    /** Calls a database function, e.g. rpc('sync_catalog_products', { p_rows: [...] }). */
    async rpc(fn, args) {
      const res = await fetch(`${base}/rpc/${fn}`, { method: 'POST', headers, body: JSON.stringify(args) });
      if (!res.ok) throw new Error(`${fn} failed: ${res.status} ${await res.text()}`);
      const text = await res.text();
      return text ? JSON.parse(text) : null;
    },
    async upsert(table, rows, { batchSize = 500, onConflict = 'id' } = {}) {
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        const res = await fetch(`${base}/${table}?on_conflict=${onConflict}`, {
          method: 'POST',
          headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify(batch),
        });
        if (!res.ok) throw new Error(`upsert ${table} failed: ${res.status} ${await res.text()}`);
      }
      return rows.length;
    },
  };
}

/**
 * Number used to order cards in a binder. Plain numbers sort by value;
 * prefixed numbers (TG01, SV001, promos) go after the main set.
 */
export function sortNumber(printed) {
  const text = String(printed ?? '').trim();
  const plain = text.match(/^(\d+)[a-z]?$/i);
  if (plain) return Number(plain[1]);
  const anyDigits = text.match(/(\d+)(?!.*\d)/);
  return anyDigits ? 10000 + Number(anyDigits[1]) : null;
}

/** '2024/11/08' or '2024-11-08T00:00:00Z' -> '2024-11-08' */
export function isoDate(value) {
  if (!value) return null;
  const match = String(value).match(/^(\d{4})[/-](\d{2})[/-](\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

/** Sets card_count on each set to the number of cards we store for it. */
export function withCardCounts(sets, cards) {
  const counts = new Map();
  for (const card of cards) counts.set(card.set_id, (counts.get(card.set_id) ?? 0) + 1);
  return sets.map((set) => ({ ...set, card_count: counts.get(set.id) ?? set.card_count ?? 0 }));
}

/** First value that's a positive number, rounded to cents; else null. */
export function positivePrice(...values) {
  for (const value of values) {
    const number = Number(value);
    if (value !== null && value !== undefined && value !== '' && Number.isFinite(number) && number > 0) {
      return Math.round(number * 100) / 100;
    }
  }
  return null;
}

const PRICE_FIELDS = ['market_usd', 'market_eur', 'market_updated_at'];

/** Drops price columns, for databases that don't have the price guide migration yet. */
export function withoutPrices(rows) {
  return rows.map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => !PRICE_FIELDS.includes(key) && key !== 'printed_total')));
}
