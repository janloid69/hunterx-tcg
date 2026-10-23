// Tests for turning each API's data into HunterX sets and cards.
// Run: node --test scripts/sync-cards/test/
// With DATABASE_URL set, the mapped rows are also loaded into a database
// that has the HunterX migration applied, to prove they fit the schema.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { isoDate, sortNumber } from '../lib.mjs';
import { mapOnePieceCards, setCodeFromCardCode } from '../sources/one-piece.mjs';
import { mapPokemonCard, mapPokemonSet, setsNeedingCards } from '../sources/pokemon.mjs';
import { mapRiftboundCards, mapRiftboundSets, pageItems } from '../sources/riftbound.mjs';

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const NOW = '2026-10-23T00:00:00.000Z';

const SET_KEYS = ['id', 'game_id', 'code', 'name', 'series', 'release_date', 'card_count', 'logo_url', 'source', 'updated_at'];
const CARD_KEYS = ['id', 'game_id', 'set_id', 'number', 'sort_number', 'name', 'rarity', 'image_small', 'image_large', 'source', 'updated_at'];

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
  assertShape(sets, SET_KEYS);
  assert.equal(sets[0].id, 'pokemon:sv8');
  assert.equal(sets[0].code, 'SSP');
  assert.equal(sets[0].release_date, '2024-11-08');
  assert.equal(sets[0].card_count, 252);
  assert.equal(sets[1].code, 'BASE1');

  const cards = fixture('pokemon-cards.json').data.map((card) => mapPokemonCard(card, NOW));
  assertShape(cards, CARD_KEYS);
  assert.equal(cards[0].id, 'pokemon:sv8-238');
  assert.equal(cards[0].set_id, 'pokemon:sv8');
  assert.equal(cards[0].sort_number, 238);
  assert.equal(cards[1].image_large, null);
});

test('Pokémon only refreshes new, changed or recent sets', () => {
  const apiSets = fixture('pokemon-sets.json').data;
  const today = new Date('2024-12-01');
  const nothingKnown = setsNeedingCards(apiSets, new Map(), today);
  assert.equal(nothingKnown.length, 2);

  const allKnown = new Map([['pokemon:sv8', 252], ['pokemon:base1', 102]]);
  assert.deepEqual(setsNeedingCards(apiSets, allKnown, today).map((s) => s.id), ['sv8']);
  assert.deepEqual(setsNeedingCards(apiSets, allKnown, new Date('2026-10-23')).map((s) => s.id), []);

  const changed = new Map([['pokemon:sv8', 252], ['pokemon:base1', 100]]);
  assert.deepEqual(setsNeedingCards(apiSets, changed, new Date('2026-10-23')).map((s) => s.id), ['base1']);
});

test('One Piece cards, alternate arts and derived sets', () => {
  const { sets, cards } = mapOnePieceCards(fixture('one-piece-cards.json'), NOW);
  assertShape(sets, SET_KEYS);
  assertShape(cards, CARD_KEYS);

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
