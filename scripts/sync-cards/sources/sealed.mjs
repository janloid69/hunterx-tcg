// Sealed products (booster boxes, Elite Trainer Boxes, packs, tins,
// collections) and their TCGplayer market prices, from tcgcsv.com.
//
// TCGCSV is a free, daily copy of TCGplayer's catalog and prices. Its author
// says no permission is needed and asks for an identifiable User-Agent and a
// short pause between requests. Runs weekly (it's about two requests per set).

import { createThrottle, getJson, isoDate, positivePrice } from '../lib.mjs';

const API = 'https://tcgcsv.com/tcgplayer';
export const SOURCE = 'tcgcsv';

/** TCGplayer category for each HunterX game, matched by name. */
const CATEGORY_NAMES = {
  pokemon: /^pok[eé]mon$/i,
  'one-piece': /^one piece card game$/i,
  riftbound: /^riftbound\b/i,
};

const BRANDS = { pokemon: 'Pokémon', 'one-piece': 'One Piece', riftbound: 'Riftbound' };

export const SEALED_GAMES = Object.keys(CATEGORY_NAMES);

/** TCGCSV wraps every list in { success, errors, results }. */
export const results = (body) => (Array.isArray(body?.results) ? body.results : []);

/** game id -> TCGplayer categoryId, for the games we know how to find. */
export function findCategories(categories, games = SEALED_GAMES) {
  const found = new Map();
  for (const game of games) {
    const pattern = CATEGORY_NAMES[game];
    if (!pattern) continue;
    const match = categories.find((c) => pattern.test(String(c.name ?? '')) || pattern.test(String(c.displayName ?? '')));
    if (match) found.set(game, match.categoryId);
  }
  return found;
}

const NOT_SEALED = /\b(code card|jumbo|oversized?)\b/i;

/** Cards carry a card number or rarity; sealed products don't. */
export function isSealedProduct(product) {
  const fields = new Set((product.extendedData ?? []).map((field) => String(field.name).toLowerCase()));
  if (fields.has('number') || fields.has('rarity')) return false;
  return !NOT_SEALED.test(String(product.name ?? ''));
}

/** TCGplayer market price in USD: the plain printing first, then any other. */
export function pickMarketPrice(prices) {
  const sorted = [...prices].sort((a, b) => (a.subTypeName === 'Normal' ? -1 : 0) - (b.subTypeName === 'Normal' ? -1 : 0));
  for (const row of sorted) {
    const usd = positivePrice(row.marketPrice);
    if (usd !== null) return usd;
  }
  return null;
}

/** One TCGCSV product -> the row sync_catalog_products expects. */
export function mapSealedProduct(product, prices, group, game, now = new Date().toISOString()) {
  const usd = pickMarketPrice(prices);
  return {
    game_id: game,
    name: String(product.name ?? product.cleanName ?? '').trim(),
    brand: BRANDS[game] ?? null,
    line: group?.name ? String(group.name).trim() : null,
    image_url: product.imageUrl || null,
    source: SOURCE,
    source_id: String(product.productId),
    market_usd: usd,
    market_updated_at: usd === null ? null : now,
    product_url: product.url || null,
    released_on: isoDate(product.presaleInfo?.releasedOn) ?? isoDate(group?.publishedOn),
  };
}

/** Sealed products of one set, with prices. */
export function mapGroup(products, prices, group, game, now) {
  const byProduct = new Map();
  for (const row of prices) {
    if (!byProduct.has(row.productId)) byProduct.set(row.productId, []);
    byProduct.get(row.productId).push(row);
  }
  return products
    .filter(isSealedProduct)
    .map((product) => mapSealedProduct(product, byProduct.get(product.productId) ?? [], group, game, now))
    .filter((row) => row.name.length >= 2);
}

/**
 * Downloads sealed products for the given games and saves them through
 * sync_catalog_products. Returns counts for the run summary.
 */
export async function syncSealed(db, { games = SEALED_GAMES, throttleMs = 250, get = getJson, now = new Date().toISOString(), log = console.log } = {}) {
  const pause = createThrottle(throttleMs);
  const fetchList = async (path) => {
    await pause();
    return results(await get(`${API}/${path}`));
  };

  const categories = findCategories(await fetchList('categories'), games);
  const missing = games.filter((game) => SEALED_GAMES.includes(game) && !categories.has(game));
  const rows = new Map();
  const failedGroups = [];

  for (const [game, categoryId] of categories) {
    const groups = await fetchList(`${categoryId}/groups`);
    log(`Sealed ${game}: checking ${groups.length} sets`);
    for (const group of groups) {
      try {
        const products = await fetchList(`${categoryId}/${group.groupId}/products`);
        if (!products.some(isSealedProduct)) continue;
        const prices = await fetchList(`${categoryId}/${group.groupId}/prices`);
        for (const row of mapGroup(products, prices, group, game, now)) rows.set(row.source_id, row);
      } catch (error) {
        failedGroups.push(`${game}: ${group.name ?? group.groupId}`);
        log(`Sealed ${game}: couldn't read ${group.name ?? group.groupId}: ${error instanceof Error ? error.message : error}`);
      }
    }
  }

  const all = [...rows.values()];
  let saved = 0;
  for (let i = 0; i < all.length; i += 500) {
    saved += Number(await db.rpc('sync_catalog_products', { p_rows: all.slice(i, i + 500) })) || 0;
  }
  return {
    games: [...categories.keys()],
    missing,
    products: saved,
    priced: all.filter((row) => row.market_usd !== null).length,
    failedGroups,
  };
}
