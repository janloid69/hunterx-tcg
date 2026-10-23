// Riftbound cards from Riftcodex (api.riftcodex.com), a free fan project
// under Riot's fan content policy. No key needed.

import { getJson, isoDate, sortNumber, withCardCounts } from '../lib.mjs';

const API = 'https://api.riftcodex.com';
const SOURCE = 'riftcodex.com';
const PAGE_SIZE = 100;

/** Accepts the list shapes paginated APIs commonly use. */
export function pageItems(body) {
  if (Array.isArray(body)) return body;
  return body?.items ?? body?.data ?? body?.results ?? [];
}

async function getAll(path) {
  const all = [];
  for (let page = 1; page < 500; page += 1) {
    const body = await getJson(`${API}${path}?page=${page}&size=${PAGE_SIZE}`);
    const items = pageItems(body);
    all.push(...items);
    const pages = body?.pages ?? (body?.total ? Math.ceil(body.total / PAGE_SIZE) : null);
    if (items.length < PAGE_SIZE || (pages !== null && page >= pages)) break;
  }
  return all;
}

export function mapRiftboundSets(apiSets, now = new Date().toISOString()) {
  return apiSets.map((set) => ({
    id: `riftbound:${set.set_id}`,
    game_id: 'riftbound',
    code: set.set_id,
    name: set.name,
    series: null,
    release_date: isoDate(set.published_on),
    card_count: set.card_count ?? null,
    logo_url: null,
    source: SOURCE,
    updated_at: now,
  }));
}

export function mapRiftboundCards(apiCards, apiSets, now = new Date().toISOString()) {
  const codeByRiftcodexId = new Map(apiSets.map((set) => [set.id, set.set_id]));
  const cards = [];
  for (const card of apiCards) {
    const setCode =
      card.set?.set_id ?? codeByRiftcodexId.get(card.set?.id) ?? card.set?.id ?? null;
    if (!setCode || !card.name) continue;
    const printed = card.public_code ? String(card.public_code).split('/')[0] : String(card.collector_number ?? '');
    const flags = [card.metadata?.alternate_art ? 'Alt Art' : null, card.metadata?.signature ? 'Signature' : null]
      .filter(Boolean)
      .join(', ');
    cards.push({
      id: `riftbound:${card.riftbound_id ?? card.id}`,
      game_id: 'riftbound',
      set_id: `riftbound:${setCode}`,
      number: printed,
      sort_number: typeof card.collector_number === 'number' ? card.collector_number : sortNumber(printed),
      name: flags ? `${card.name} (${flags})` : card.name,
      rarity: card.classification?.rarity ?? null,
      image_small: card.media?.image_url ?? null,
      image_large: card.media?.image_url ?? null,
      source: SOURCE,
      updated_at: now,
    });
  }
  return cards;
}

export async function syncRiftbound(db, { log = console.log } = {}) {
  const apiSets = await getAll('/sets');
  const apiCards = await getAll('/cards');
  const cards = mapRiftboundCards(apiCards, apiSets);
  const sets = withCardCounts(mapRiftboundSets(apiSets), cards);
  await db.upsert('card_sets', sets);
  await db.upsert('cards', cards);
  log(`Riftbound: saved ${sets.length} sets and ${cards.length} cards`);
  return { sets: sets.length, cards: cards.length };
}
