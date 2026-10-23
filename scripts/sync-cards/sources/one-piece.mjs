// One Piece Card Game cards from optcgapi.com (free, community-run).
// One request per run: the author asks people not to make many calls a day.

import { getJson, sortNumber, withCardCounts } from '../lib.mjs';

const API = 'https://optcgapi.com/api';
const SOURCE = 'optcgapi.com';

/** 'OP01-001' -> 'OP-01'; 'EB01-012' -> 'EB-01' */
export function setCodeFromCardCode(code) {
  const prefix = String(code).split('-')[0];
  const match = prefix.match(/^([A-Z]+)(\d+)$/i);
  return match ? `${match[1].toUpperCase()}-${match[2]}` : prefix.toUpperCase();
}

/** 'Romance Dawn [OP-01]' -> 'Romance Dawn' */
function cleanSetName(name) {
  return String(name ?? '').replace(/\s*\[[^\]]*\]\s*$/, '').replace(/^-+|-+$/g, '').trim();
}

/**
 * Turns the API's flat card list into our sets and cards. Field names are
 * read defensively because the API documents endpoints but not fields.
 */
export function mapOnePieceCards(rows, now = new Date().toISOString()) {
  const sets = new Map();
  const cards = new Map();

  for (const row of rows) {
    const code = row.card_set_id ?? row.card_id ?? row.id;
    const name = row.card_name ?? row.name;
    if (!code || !name) continue;

    const setCode = row.set_id ?? setCodeFromCardCode(code);
    const setId = `one-piece:${setCode}`;
    if (!sets.has(setId)) {
      sets.set(setId, {
        id: setId,
        game_id: 'one-piece',
        code: setCode,
        name: cleanSetName(row.set_name) || setCode,
        series: null,
        release_date: null,
        card_count: null,
        logo_url: null,
        source: SOURCE,
        updated_at: now,
      });
    }

    // Alternate arts share a card code but have their own image id.
    const uniqueId = row.card_image_id ?? code;
    const id = `one-piece:${uniqueId}`;
    if (cards.has(id)) continue;
    cards.set(id, {
      id,
      game_id: 'one-piece',
      set_id: setId,
      number: String(code),
      sort_number: sortNumber(String(code).split('-')[1]),
      name: uniqueId !== code ? `${name} (Alt Art)` : name,
      rarity: row.rarity ?? null,
      image_small: row.card_image ?? row.image ?? null,
      image_large: row.card_image ?? row.image ?? null,
      source: SOURCE,
      updated_at: now,
    });
  }

  const cardList = [...cards.values()];
  return { sets: withCardCounts([...sets.values()], cardList), cards: cardList };
}

export async function syncOnePiece(db, { log = console.log } = {}) {
  const rows = await getJson(`${API}/allSetCards/`);
  if (!Array.isArray(rows)) throw new Error('optcgapi.com allSetCards did not return a list');
  const { sets, cards } = mapOnePieceCards(rows);
  await db.upsert('card_sets', sets);
  await db.upsert('cards', cards);
  log(`One Piece: saved ${sets.length} sets and ${cards.length} cards`);
  return { sets: sets.length, cards: cards.length };
}
