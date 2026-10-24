// Pokémon TCG cards from pokemontcg.io (v2 API).
// Free; an optional key (POKEMONTCG_API_KEY) raises the daily limit.

import { createThrottle, getJson, isoDate, positivePrice, sortNumber, withoutPrices } from '../lib.mjs';

const API = 'https://api.pokemontcg.io/v2';
const SOURCE = 'pokemontcg.io';

export function mapPokemonSet(set, now = new Date().toISOString()) {
  return {
    id: `pokemon:${set.id}`,
    game_id: 'pokemon',
    code: set.ptcgoCode ?? set.id.toUpperCase(),
    name: set.name,
    series: set.series ?? null,
    release_date: isoDate(set.releaseDate),
    card_count: set.total ?? set.printedTotal ?? null,
    printed_total: set.printedTotal ?? null,
    logo_url: set.images?.logo ?? null,
    source: SOURCE,
    updated_at: now,
  };
}

// The card's own printing first; reverse holos only when that's all there is.
const TCGPLAYER_VARIANTS = ['normal', 'holofoil', '1stEditionHolofoil', 'unlimitedHolofoil', '1stEditionNormal', 'unlimited', '1stEdition', 'reverseHolofoil'];

/** TCGplayer market price (USD) and Cardmarket trend price (EUR) from a pokemontcg.io card. */
export function pokemonPrices(card) {
  const variants = card.tcgplayer?.prices ?? {};
  let usd = null;
  for (const key of [...TCGPLAYER_VARIANTS, ...Object.keys(variants)]) {
    usd = positivePrice(variants[key]?.market, variants[key]?.mid);
    if (usd !== null) break;
  }
  const cardmarket = card.cardmarket?.prices ?? {};
  const eur = positivePrice(cardmarket.trendPrice, cardmarket.averageSellPrice, cardmarket.avg30);
  const updated = isoDate(card.tcgplayer?.updatedAt) ?? isoDate(card.cardmarket?.updatedAt);
  return {
    market_usd: usd,
    market_eur: eur,
    market_updated_at: (usd !== null || eur !== null) && updated ? `${updated}T00:00:00Z` : null,
  };
}

export function mapPokemonCard(card, now = new Date().toISOString()) {
  return {
    id: `pokemon:${card.id}`,
    game_id: 'pokemon',
    set_id: `pokemon:${card.set.id}`,
    number: String(card.number),
    sort_number: sortNumber(card.number),
    name: card.name,
    rarity: card.rarity ?? null,
    image_small: card.images?.small ?? null,
    image_large: card.images?.large ?? null,
    ...pokemonPrices(card),
    source: SOURCE,
    updated_at: now,
  };
}

/**
 * Sets whose cards still need downloading: any set where we have stored fewer
 * cards than the set contains (new sets, or a run that stopped partway), plus
 * recent sets, which still get new promos and corrections.
 * `storedCounts` maps our set id ('pokemon:sv8') to cards actually stored.
 */
export function setsNeedingCards(apiSets, storedCounts, today = new Date()) {
  const recentCutoff = new Date(today.getTime() - 120 * 24 * 60 * 60 * 1000);
  return apiSets.filter((set) => {
    const stored = storedCounts.get(`pokemon:${set.id}`) ?? 0;
    const expected = set.total ?? set.printedTotal ?? 0;
    if (stored === 0 || stored < expected) return true;
    const released = isoDate(set.releaseDate);
    return released !== null && new Date(released) >= recentCutoff;
  });
}

/** Counts the cards we already store for each set (fast: Supabase, not the card API). */
async function storedCardCounts(db, apiSets) {
  const counts = new Map();
  const queue = apiSets.map((set) => `pokemon:${set.id}`);
  const worker = async () => {
    while (queue.length > 0) {
      const id = queue.shift();
      counts.set(id, (await db.count('cards', `set_id=eq.${encodeURIComponent(id)}`)) ?? 0);
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  return counts;
}

/**
 * Downloads cards for the sets that need them; with fullRefresh, every set
 * (once a week, so prices for older sets stay current).
 */
export async function syncPokemon(db, { apiKey, log = console.log, fullRefresh = false, withPrices = true } = {}) {
  const headers = apiKey ? { 'X-Api-Key': apiKey } : {};
  // Without a key the API allows 30 requests a minute, so space them out.
  const throttle = createThrottle(apiKey ? 400 : 2100);
  const get = async (url) => {
    await throttle();
    return getJson(url, { headers, retries: 6 });
  };

  const apiSets = [];
  for (let page = 1; ; page += 1) {
    const body = await get(`${API}/sets?page=${page}&pageSize=250&orderBy=releaseDate`);
    apiSets.push(...body.data);
    if (apiSets.length >= body.totalCount || body.data.length === 0) break;
  }
  const setRows = apiSets.map((set) => mapPokemonSet(set));
  await db.upsert('card_sets', withPrices ? setRows : withoutPrices(setRows));

  const toRefresh = fullRefresh ? apiSets : setsNeedingCards(apiSets, await storedCardCounts(db, apiSets));
  log(`Pokémon: ${apiSets.length} sets, downloading cards for ${toRefresh.length}${fullRefresh ? ' (weekly price refresh)' : ''}`);

  // Each set is saved as soon as it downloads, and one failing set doesn't stop
  // the rest. Anything missed is picked up again on the next run.
  let cardTotal = 0;
  const failedSets = [];
  for (const set of toRefresh) {
    try {
      const cards = [];
      for (let page = 1; ; page += 1) {
        const query = `q=set.id:${encodeURIComponent(set.id)}&page=${page}&pageSize=250&select=id,name,number,rarity,set,images,tcgplayer,cardmarket`;
        const body = await get(`${API}/cards?${query}`);
        cards.push(...body.data);
        if (cards.length >= body.totalCount || body.data.length === 0) break;
      }
      const rows = cards.map((card) => mapPokemonCard(card));
      cardTotal += await db.upsert('cards', withPrices ? rows : withoutPrices(rows));
    } catch (error) {
      failedSets.push(set.id);
      log(`Pokémon: set ${set.id} failed: ${error instanceof Error ? error.message : error}`);
    }
  }
  log(`Pokémon: saved ${cardTotal} cards${failedSets.length ? `, ${failedSets.length} sets failed` : ''}`);
  if (failedSets.length > 0 && failedSets.length === toRefresh.length) {
    throw new Error(`Every Pokémon set failed to download (${failedSets.length} sets)`);
  }
  return { sets: apiSets.length, cards: cardTotal, failedSets };
}
