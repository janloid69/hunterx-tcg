// Tests for turning each API's data into HunterX sets and cards.
// Run: node --test scripts/sync-cards/test/
// With DATABASE_URL set, the mapped rows are also loaded into a database
// that has the HunterX migration applied, to prove they fit the schema.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { isoDate, positivePrice, sortNumber, withoutPrices } from '../lib.mjs';
import { parseErApi, parseFrankfurter, syncFxRates } from '../sources/fx.mjs';
import { mapOnePieceCards, setCodeFromCardCode } from '../sources/one-piece.mjs';
import { mapPokemonCard, mapPokemonSet, pokemonPrices, setsNeedingCards } from '../sources/pokemon.mjs';
import { mapRiftboundCards, mapRiftboundSets, pageItems } from '../sources/riftbound.mjs';

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const NOW = '2026-10-23T00:00:00.000Z';

const SET_KEYS = ['id', 'game_id', 'code', 'name', 'series', 'release_date', 'card_count', 'logo_url', 'source', 'updated_at'];
const CARD_KEYS = ['id', 'game_id', 'set_id', 'number', 'sort_number', 'name', 'rarity', 'image_small', 'image_large', 'source', 'updated_at'];
const PRICE_KEYS = ['market_usd', 'market_eur', 'market_updated_at'];
const POKEMON_SET_KEYS = [...SET_KEYS, 'printed_total'];
const PRICED_CARD_KEYS = [...CARD_KEYS, ...PRICE_KEYS];

function assertShape(rows, keys) {
  for (const row of rows) assert.deepEqual(Object.keys(row).sort(), [...keys].sort());
}

test('helpers', () => {
  assert.equal(sortNumber('238'), 238);
  assert.equal(sortNumber('25a'), 25);
  assert.equal(sortNumber('TG01'), 10001);
  assert.equal(sortNumber(''), null);
  assert.equal(isoDate('2024/11/08'), '2024-11-08');
  assert.equal(isoDate('2025-10-31T00:00:00Z'), '2025-10-31');
  assert.equal(isoDate(undefined), null);
  assert.equal(setCodeFromCardCode('OP01-001'), 'OP-01');
  assert.equal(setCodeFromCardCode('EB01-012'), 'EB-01');
});

test('Pokémon sets and cards', () => {
  const sets = fixture('pokemon-sets.json').data.map((set) => mapPokemonSet(set, NOW));
  assertShape(sets, POKEMON_SET_KEYS);
  assert.equal(sets[0].id, 'pokemon:sv8');
  assert.equal(sets[0].code, 'SSP');
  assert.equal(sets[0].release_date, '2024-11-08');
  assert.equal(sets[0].card_count, 252);
  assert.equal(sets[0].printed_total, 191, 'the number printed on cards: 238/191');
  assert.equal(sets[1].code, 'BASE1');

  const cards = fixture('pokemon-cards.json').data.map((card) => mapPokemonCard(card, NOW));
  assertShape(cards, PRICED_CARD_KEYS);
  assert.equal(cards[0].id, 'pokemon:sv8-238');
  assert.equal(cards[0].set_id, 'pokemon:sv8');
  assert.equal(cards[0].sort_number, 238);
  assert.equal(cards[1].image_large, null);
});

test('Pokémon downloads sets that are missing cards, plus recent sets', () => {
  const apiSets = fixture('pokemon-sets.json').data; // sv8 has 252 cards, base1 has 102
  const later = new Date('2026-10-23');

  assert.equal(setsNeedingCards(apiSets, new Map(), later).length, 2, 'nothing stored yet');

  const complete = new Map([['pokemon:sv8', 252], ['pokemon:base1', 102]]);
  assert.deepEqual(setsNeedingCards(apiSets, complete, later).map((s) => s.id), []);
  assert.deepEqual(
    setsNeedingCards(apiSets, complete, new Date('2024-12-01')).map((s) => s.id),
    ['sv8'],
    'recent sets are refreshed even when complete',
  );

  const partial = new Map([['pokemon:sv8', 252], ['pokemon:base1', 40]]);
  assert.deepEqual(setsNeedingCards(apiSets, partial, later).map((s) => s.id), ['base1'], 'a run that stopped partway is resumed');

  const empty = new Map([['pokemon:sv8', 0], ['pokemon:base1', 102]]);
  assert.deepEqual(setsNeedingCards(apiSets, empty, later).map((s) => s.id), ['sv8']);
});

test('Pokémon prices: the card\'s own printing, then Cardmarket', () => {
  const [pikachu, exeggcute] = fixture('pokemon-cards.json').data;
  assert.deepEqual(pokemonPrices(pikachu), { market_usd: 201.37, market_eur: 149.99, market_updated_at: '2026-10-22T00:00:00Z' });
  assert.equal(pokemonPrices(exeggcute).market_usd, 0.08, 'normal before reverse holo');
  assert.deepEqual(pokemonPrices({ tcgplayer: { prices: { reverseHolofoil: { market: 0.5 } } } }).market_usd, 0.5, 'reverse holo when that is all there is');
  assert.deepEqual(pokemonPrices({}), { market_usd: null, market_eur: null, market_updated_at: null });
  assert.equal(positivePrice(null, 0, '', '3.456'), 3.46);
});

test('exchange rates', async () => {
  assert.deepEqual(parseFrankfurter(fixture('fx-frankfurter-usd.json'), 'USD'), { currency: 'USD', php: 58.214, as_of: '2026-10-23' });
  assert.throws(() => parseFrankfurter({ rates: {} }, 'USD'), /no PHP rate/);
  const [usd, eur] = parseErApi(fixture('fx-er-api.json'));
  assert.deepEqual(usd, { currency: 'USD', php: 58.3, as_of: '2026-10-23' });
  assert.equal(eur.php, 63.362678, 'EUR->PHP from the USD table');

  // Frankfurter down: falls back, and saves by currency.
  const saved = [];
  const db = { upsert: async (table, rows, options) => saved.push({ table, rows, options }) };
  const get = async (url) => {
    if (url.includes('frankfurter')) throw new Error('503');
    return fixture('fx-er-api.json');
  };
  await syncFxRates(db, { get, log: () => {} });
  assert.equal(saved[0].table, 'fx_rates');
  assert.deepEqual(saved[0].options, { onConflict: 'currency' });
  assert.deepEqual(saved[0].rows.map((r) => r.currency), ['USD', 'EUR']);
});

test('without the price guide migration, price columns are left out', () => {
  const [card] = fixture('pokemon-cards.json').data.map((c) => mapPokemonCard(c, NOW));
  assertShape(withoutPrices([card]), CARD_KEYS);
  const [set] = fixture('pokemon-sets.json').data.map((s) => mapPokemonSet(s, NOW));
  assertShape(withoutPrices([set]), SET_KEYS);
});

test('One Piece cards, alternate arts and derived sets', () => {
  const { sets, cards } = mapOnePieceCards(fixture('one-piece-cards.json'), NOW);
  assertShape(sets, SET_KEYS);
  assertShape(cards, PRICED_CARD_KEYS);
  const base = cards.find((c) => c.id === 'one-piece:OP01-001');
  assert.equal(base.market_usd, 1.25, 'market price before inventory price');
  assert.equal(base.market_updated_at, '2026-10-22T00:00:00Z');
  assert.equal(cards.find((c) => c.id === 'one-piece:OP01-001_p1').market_usd, 48.5, 'alt arts have their own price');
  assert.equal(cards.find((c) => c.id === 'one-piece:OP01-120').market_usd, 210);
  assert.equal(cards.find((c) => c.id === 'one-piece:EB01-001').market_usd, null);

  assert.deepEqual(sets.map((s) => s.id).sort(), ['one-piece:EB-01', 'one-piece:OP-01']);
  const op01 = sets.find((s) => s.id === 'one-piece:OP-01');
  assert.equal(op01.name, 'Romance Dawn');
  assert.equal(op01.card_count, 3);
  assert.equal(sets.find((s) => s.id === 'one-piece:EB-01').name, 'Memorial Collection');

  assert.equal(cards.length, 4, 'row without a code is skipped');
  const alt = cards.find((c) => c.id === 'one-piece:OP01-001_p1');
  assert.equal(alt.name, 'Roronoa Zoro (Alt Art)');
  assert.equal(alt.number, 'OP01-001');
  assert.equal(cards.find((c) => c.id === 'one-piece:OP01-120').sort_number, 120);
});

test('Riftbound sets and cards', () => {
  const apiSets = pageItems(fixture('riftbound-sets.json'));
  const apiCards = pageItems(fixture('riftbound-cards.json'));
  const sets = mapRiftboundSets(apiSets, NOW);
  const cards = mapRiftboundCards(apiCards, apiSets, NOW);
  assertShape(sets, SET_KEYS);
  assertShape(cards, CARD_KEYS);

  assert.equal(sets[0].id, 'riftbound:OGN');
  assert.equal(sets[0].release_date, '2025-10-31');
  assert.equal(cards[0].set_id, 'riftbound:OGN', 'set found through its Riftcodex id');
  assert.equal(cards[0].number, 'OGN-001');
  assert.equal(cards[1].set_id, 'riftbound:OGN', 'set found through set_id');
  assert.equal(cards[1].name, 'Jinx, Loose Cannon (Alt Art)');
  assert.deepEqual(pageItems([1, 2]), [1, 2]);
  assert.deepEqual(pageItems({ data: [3] }), [3]);
});

test('mapped rows fit the database schema', { skip: !process.env.DATABASE_URL }, () => {
  const pokemonSets = fixture('pokemon-sets.json').data.map((s) => mapPokemonSet(s, NOW));
  const pokemonCards = fixture('pokemon-cards.json').data.map((c) => mapPokemonCard(c, NOW));
  const onePiece = mapOnePieceCards(fixture('one-piece-cards.json'), NOW);
  const riftSets = pageItems(fixture('riftbound-sets.json'));
  const riftCards = mapRiftboundCards(pageItems(fixture('riftbound-cards.json')), riftSets, NOW);

  const sets = [...pokemonSets, ...onePiece.sets, ...mapRiftboundSets(riftSets, NOW)];
  const cards = [...pokemonCards, ...onePiece.cards, ...riftCards];

  const sql = `
    begin;
    insert into public.card_sets select * from json_populate_recordset(null::public.card_sets, $sets$${JSON.stringify(sets)}$sets$);
    insert into public.cards select * from json_populate_recordset(null::public.cards, $cards$${JSON.stringify(cards)}$cards$);
    select count(*) from public.cards where id like any (array['pokemon:%', 'one-piece:%', 'riftbound:%']);
    rollback;
  `;
  const out = execFileSync('psql', [process.env.DATABASE_URL, '-v', 'ON_ERROR_STOP=1', '-tA', '-c', sql], {
    encoding: 'utf8',
  });
  assert.match(out, new RegExp(`^${cards.length}$`, 'm'));
});
