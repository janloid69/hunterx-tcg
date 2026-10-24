// Exchange rates to pesos for the global prices (TCGplayer is USD, Cardmarket
// EUR). Frankfurter (European Central Bank rates) first, open.er-api.com if it's
// down. Both are free and need no key.

import { getJson, isoDate } from '../lib.mjs';

/** { rates: { PHP: 58.2 }, date: '2026-10-23' } -> one fx_rates row */
export function parseFrankfurter(body, currency) {
  const php = Number(body?.rates?.PHP);
  if (!Number.isFinite(php) || php <= 0) throw new Error(`Frankfurter had no PHP rate for ${currency}`);
  return { currency, php, as_of: isoDate(body.date) ?? new Date().toISOString().slice(0, 10) };
}

/** open.er-api.com's USD table -> USD and EUR rows */
export function parseErApi(body) {
  const php = Number(body?.rates?.PHP);
  const eur = Number(body?.rates?.EUR);
  if (!(php > 0) || !(eur > 0)) throw new Error('open.er-api.com had no PHP or EUR rate');
  const updated = new Date(body.time_last_update_utc ?? Date.now());
  const asOf = Number.isNaN(updated.getTime()) ? new Date().toISOString().slice(0, 10) : updated.toISOString().slice(0, 10);
  return [
    { currency: 'USD', php, as_of: asOf },
    { currency: 'EUR', php: Math.round((php / eur) * 1e6) / 1e6, as_of: asOf },
  ];
}

export async function syncFxRates(db, { log = console.log, get = getJson } = {}) {
  let rows;
  try {
    rows = [
      parseFrankfurter(await get('https://api.frankfurter.dev/v1/latest?base=USD&symbols=PHP'), 'USD'),
      parseFrankfurter(await get('https://api.frankfurter.dev/v1/latest?base=EUR&symbols=PHP'), 'EUR'),
    ];
  } catch (error) {
    log(`Exchange rates: Frankfurter failed (${error.message}), trying open.er-api.com`);
    rows = parseErApi(await get('https://open.er-api.com/v6/latest/USD'));
  }
  const now = new Date().toISOString();
  await db.upsert('fx_rates', rows.map((row) => ({ ...row, updated_at: now })), { onConflict: 'currency' });
  log(`Exchange rates: ${rows.map((row) => `1 ${row.currency} = ₱${row.php.toFixed(2)}`).join(', ')} (${rows[0].as_of})`);
  return rows;
}
