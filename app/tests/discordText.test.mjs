// Tests for showing Discord posts on the website.
// Run: node --test --experimental-strip-types app/tests/
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { discordParts, shortUrl } from '../src/lib/discordText.ts';

test('bare links become short, tappable links; trailing punctuation stays text', () => {
  assert.deepEqual(discordParts('UPC: https://www.walmart.com/ip/POKEMON-30TH-ANNIVERSARY-DAY-NIGHT/20887353294.'), [
    { kind: 'text', text: 'UPC: ' },
    { kind: 'link', text: 'walmart.com/ip/POKEMON-30TH-ANNIVERSA…', url: 'https://www.walmart.com/ip/POKEMON-30TH-ANNIVERSARY-DAY-NIGHT/20887353294' },
    { kind: 'text', text: '.' },
  ]);
  assert.deepEqual(discordParts('<https://www.pokemoncenter.com/>'), [
    { kind: 'link', text: 'pokemoncenter.com', url: 'https://www.pokemoncenter.com/' },
  ]);
});

test('masked links keep their label; bold stays bold; other symbols go', () => {
  assert.deepEqual(discordParts('**Queue up** at [Pokémon Center](https://www.pokemoncenter.com/) ~~now~~ ||soon||'), [
    { kind: 'text', text: 'Queue up', bold: true },
    { kind: 'text', text: ' at ' },
    { kind: 'link', text: 'Pokémon Center', url: 'https://www.pokemoncenter.com/' },
    { kind: 'text', text: ' now soon' },
  ]);
  assert.deepEqual(discordParts('**https://example.com/a**'), [{ kind: 'link', text: 'example.com/a', url: 'https://example.com/a', bold: true }]);
});

test('headings, quotes and bullets read as plain lines', () => {
  assert.deepEqual(discordParts('# Drops\n> US Addy only\n- UPC\n\n\n\nTime: TBA'), [
    { kind: 'text', text: 'Drops\nUS Addy only\n• UPC\n\nTime: TBA' },
  ]);
});

test('short urls', () => {
  assert.equal(shortUrl('https://www.pokemoncenter.com/'), 'pokemoncenter.com');
  assert.equal(shortUrl('http://x.com/abcdefghij', 10), 'x.com/abc…');
});

test('empty and plain text', () => {
  assert.deepEqual(discordParts(''), []);
  assert.deepEqual(discordParts('30th Poster Collection^'), [{ kind: 'text', text: '30th Poster Collection^' }]);
});
