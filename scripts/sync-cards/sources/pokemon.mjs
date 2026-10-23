// Pokémon TCG cards from pokemontcg.io (v2 API).
// Free; an optional key (POKEMONTCG_API_KEY) raises the daily limit.

import { createThrottle, getJson, isoDate, sortNumber } from '../lib.mjs';

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
    logo_url: set.images?.logo ?? null,
    source: SOURCE,
    updated_at: now,
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
    source: SOURCE,
    updated_at: now,
  };
}

/** Sets that are new, changed size, or came out recently get their cards refreshed. */
export function setsNeedingCards(apiSets, knownCounts, today = new Date()) {
  const recentCutoff = new Date(today.getTime() - 120 * 24 * 60 * 60 * 1000);
  return apiSets.filter((set) => {
    const known = knownCounts.get(`pokemon:${set.id}`);
    if (known === undefined || known === null) return true;
    if (known !== (set.total ?? set.printedTotal)) return true;
    const released = isoDate(set.releaseDate);
    return released !== null && new Date(released) >= recentCutoff;
  });
}

export async function syncPokemon(db, { apiKey, log = console.log } = {}) {
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

  const known = await db.select('card_sets', 'select=id,card_count&game_id=eq.pokemon');
  const knownCounts = new Map(known.map((row) => [row.id, row.card_count]));
  const toRefresh = setsNeedingCards(apiSets, knownCounts);
  log(`Pokémon: ${apiSets.length} sets, refreshing cards for ${toRefresh.length}`);

  await db.upsert('card_sets', apiSets.map((set) => mapPokemonSet(set)));

  let cardTotal = 0;
  for (const set of toRefresh) {
    const cards = [];
    for (let page = 1; ; page += 1) {
      const query = `q=set.id:${encodeURIComponent(set.id)}&page=${page}&pageSize=250&select=id,name,number,rarity,set,images`;
      const body = await get(`${API}/cards?${query}`);
      cards.push(...body.data);
      if (cards.length >= body.totalCount || body.data.length === 0) break;
    }
    cardTotal += await db.upsert('cards', cards.map((card) => mapPokemonCard(card)));
  }
  log(`Pokémon: saved ${cardTotal} cards`);
  return { sets: apiSets.length, cards: cardTotal };
}
