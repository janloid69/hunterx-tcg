// Talks to Supabase (PostgREST) with the secret key. The secret key skips the
// website's row rules, so it lives only in the bot's .env on the server.

export class DbError extends Error {
  constructor(status, body, what) {
    const message = body?.message ?? body?.error ?? `HTTP ${status}`;
    super(`Supabase ${what} failed (${status}): ${message}${body?.hint ? ` (${body.hint})` : ''}`);
    this.name = 'DbError';
    this.status = status;
    this.code = body?.code ?? null;
    this.detail = message;
    this.hint = body?.hint ?? null;
  }
}

const sleepFor = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function createDb({ url, secretKey, fetchImpl = fetch, sleep = sleepFor }) {
  if (!url || !secretKey) throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY are required');
  const base = `${url.replace(/\/$/, '')}/rest/v1`;
  const headers = { apikey: secretKey, 'Content-Type': 'application/json' };
  // Older service_role keys are JWTs and also go in Authorization.
  if (secretKey.startsWith('eyJ')) headers.Authorization = `Bearer ${secretKey}`;

  async function call(method, path, { body, prefer, what } = {}, attempt = 0) {
    let res;
    try {
      res = await fetchImpl(`${base}/${path}`, {
        method,
        headers: prefer ? { ...headers, Prefer: prefer } : headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (cause) {
      if (attempt < 3) {
        await sleep(1000 * 2 ** attempt);
        return call(method, path, { body, prefer, what }, attempt + 1);
      }
      throw new Error(`Can't reach Supabase (${what ?? path}): ${cause.message}`);
    }
    if ((res.status >= 500 || res.status === 429) && attempt < 3) {
      await sleep(1000 * 2 ** attempt);
      return call(method, path, { body, prefer, what }, attempt + 1);
    }
    const text = await res.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { message: text.slice(0, 200) };
      }
    }
    if (!res.ok) throw new DbError(res.status, data, what ?? `${method} ${path.split('?')[0]}`);
    return data;
  }

  return {
    /** Rows matching a PostgREST query string, e.g. select('listings', 'id=eq.x&select=*'). */
    select: (table, query) => call('GET', `${table}?${query}`, { what: `read ${table}` }),
    /** First matching row or null. */
    async one(table, query) {
      const rows = await call('GET', `${table}?${query}&limit=1`, { what: `read ${table}` });
      return rows?.[0] ?? null;
    },
    rpc: (fn, args = {}) => call('POST', `rpc/${fn}`, { body: args, what: fn }),
    upsert: (table, row, onConflict) =>
      call('POST', `${table}?on_conflict=${onConflict}`, {
        body: row,
        prefer: 'resolution=merge-duplicates,return=minimal',
        what: `save ${table}`,
      }),
    update: (table, filter, patch) =>
      call('PATCH', `${table}?${filter}`, { body: patch, prefer: 'return=minimal', what: `update ${table}` }),
    remove: (table, filter) => call('DELETE', `${table}?${filter}`, { prefer: 'return=minimal', what: `delete ${table}` }),
  };
}
