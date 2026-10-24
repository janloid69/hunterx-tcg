// Tests for reading card numbers from scanner text.
// Run: node --test --experimental-strip-types app/tests/
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseScanText, parseTypedNumber, pokemonNumber } from '../src/lib/scanParse.ts';

const numbers = (text) => parseScanText(text).map((g) => (g.game === 'pokemon' ? `${g.setCode ?? ''} ${g.number}/${g.total}`.trim() : g.number));

test('One Piece numbers, including camera mix-ups', () => {
  assert.deepEqual(numbers('OP17-048'), ['OP17-048']);
  assert.deepEqual(numbers('C 0P0I-12O L'), ['OP01-120'], 'O/0 and I/1 mix-ups');
  assert.deepEqual(numbers('ST10 - 005'), ['ST10-005']);
  assert.deepEqual(numbers('5T10-005'), ['ST10-005']);
  assert.deepEqual(numbers('E801-012'), ['EB01-012']);
  assert.deepEqual(numbers('PRB01-001'), ['PRB01-001']);
  assert.deepEqual(numbers('OP05119'), ['OP05-119'], 'dash missed');
  assert.deepEqual(numbers('P-025'), ['P-025']);
  assert.deepEqual(numbers('XOP01-001X 1234'), [], 'part of a longer word is not a number');
});

test('Pokémon numbers and set codes', () => {
  assert.deepEqual(numbers('238/191'), ['238/191']);
  assert.deepEqual(numbers('G SSP EN 238/191'), ['SSP 238/191']);
  assert.deepEqual(numbers('PAL EN 001/193'), ['PAL 1/193'], 'leading zeros dropped like the card database');
  assert.deepEqual(numbers('2O1 / 165'), ['201/165']);
  assert.deepEqual(numbers('TG01/TG30'), ['TG01/TG30']);
  assert.deepEqual(numbers('4|102'), ['4/102'], 'a slash read as a bar');
  assert.deepEqual(numbers('HP 120 0/0'), [], 'zero total is not a card number');
  assert.equal(pokemonNumber('001'), '1');
  assert.equal(pokemonNumber('TG05'), 'TG05');
});

test('repeats are dropped and both games can show up', () => {
  assert.deepEqual(numbers('OP01-001 OP01-001 25/102'), ['OP01-001', '25/102']);
});

test('typed numbers', () => {
  const [bare] = parseTypedNumber('238');
  assert.equal(bare.game, 'pokemon');
  assert.equal(bare.number, '238');
  assert.equal(bare.total, null);
  const [coded] = parseTypedNumber('ssp 238');
  assert.equal(coded.setCode, 'SSP');
  assert.deepEqual(parseTypedNumber('op01-120').map((g) => g.number), ['OP01-120']);
  assert.deepEqual(parseTypedNumber('pikachu'), []);
});
