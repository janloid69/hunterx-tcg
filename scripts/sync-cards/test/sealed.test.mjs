// Tests for sealed products from tcgcsv.com.
// Run: node --test scripts/sync-cards/test/
// With DATABASE_URL set, the rows also go through sync_catalog_products in a
// database with the HunterX migrations applied (rolled back afterwards).

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { findCategories, isSealedProduct, mapGroup, pickMarketPrice, results, syncSealed } from '../sources/sealed.mjs';

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const NOW = '2026-10-27T00:00:00.000Z';

const ROW_KEYS = [
  'game_id', 'name', 'brand', 'line', 'image_url', 'source', 'source_id',
  'market_usd', 'market_updated_at', 'product_url', 'released_on',
];

const prismatic = () => {
  const group = results(fixture('tcgcsv-groups-pokemon.json'))[0];
  return mapGroup(
    results(fixture('tcgcsv-products-prismatic.json')),
    results(fixture('tcgcsv-prices-prismatic.json')),
    group,
    'pokemon',
    NOW,
  );
};

test('finds each game\'s TCGplayer category by name', () => {
  const categories = findCategories(results(fixture('tcgcsv-categories.json')));
  assert.deepEqual(Object.fromEntries(categories), { pokemon: 3, 'one-piece': 68, riftbound: 89 });
  assert.deepEqual([...findCategories(results(fixture('tcgcsv-categories.json')), ['pokemon']).keys()], ['pokemon']);
  assert.equal(findCategories([], ['pokemon']).size, 0);
});

test('tells sealed products from cards and code cards', () => {
  const products = results(fixture('tcgcsv-products-prismatic.json'));
  const sealed = products.filter(isSealedProduct).map((p) => p.name);
  assert.deepEqual(sealed, [
    'Prismatic Evolutions Elite Trainer Box',
    'Prismatic Evolutions Booster Bundle',
    'Prismatic Evolutions Booster Pack',
  ]);
});

test('market price: the plain printing first, skipping missing and zero prices', () => {
  assert.equal(pickMarketPrice([{ subTypeName: 'Holofoil', marketPrice: 50 }, { subTypeName: 'Normal', marketPrice: 40 }]), 40);
  assert.equal(pickMarketPrice([{ subTypeName: 'Normal', marketPrice: null }, { subTypeName: 'Holofoil', marketPrice: 47.25 }]), 47.25);
  assert.equal(pickMarketPrice([{ subTypeName: 'Normal', marketPrice: 0 }]), null);
  assert.equal(pickMarketPrice([]), null);
});

test('maps a set\'s sealed products', () => {
  const rows = prismatic();
  for (const row of rows) assert.deepEqual(Object.keys(row).sort(), [...ROW_KEYS].sort());
  const [etb, bundle, pack] = rows;
  assert.deepEqual(etb, {
    game_id: 'pokemon',
    name: 'Prismatic Evolutions Elite Trainer Box',
    brand: 'Pokémon',
    line: 'SV: Prismatic Evolutions',
    image_url: 'https://tcgplayer-cdn.tcgplayer.com/product/593355_200w.jpg',
    source: 'tcgcsv',
    source_id: '593355',
    market_usd: 89.99,
    market_updated_at: NOW,
    product_url: 'https://www.tcgplayer.com/product/593355/pokemon-sv-prismatic-evolutions-prismatic-evolutions-elite-trainer-box',
    released_on: '2025-01-17',
  });
  assert.equal(bundle.market_usd, 47.25, 'falls back to another printing');
  assert.equal(bundle.released_on, '2025-01-17', 'uses the set date when the product has none');
  assert.equal(pack.market_usd, null);
  assert.equal(pack.market_updated_at, null);
});

test('sync: skips sets without sealed products, records failures, saves in one call', async () => {
  const requests = [];
  const files = {
    categories: 'tcgcsv-categories.json',
    '3/groups': 'tcgcsv-groups-pokemon.json',
    '3/23821/products': 'tcgcsv-products-prismatic.json',
    '3/23821/prices': 'tcgcsv-prices-prismatic.json',
    '3/1938/products': 'tcgcsv-products-promos.json',
  };
  const get = async (url) => {
    const path = url.replace('https://tcgcsv.com/tcgplayer/', '');
    requests.push(path);
    if (path === '68/groups') return { success: true, errors: [], results: [{ groupId: 1, name: 'Romance Dawn', publishedOn: '2022-12-02T00:00:00' }] };
    if (path === '68/1/products') throw new Error('GET failed with 500');
    if (!files[path]) throw new Error(`unexpected request ${path}`);
    return fixture(files[path]);
  };
  const calls = [];
  const db = {
    rpc: async (fn, args) => {
      calls.push([fn, args]);
      return args.p_rows.length;
    },
  };

  const result = await syncSealed(db, { games: ['pokemon', 'one-piece'], throttleMs: 0, get, now: NOW, log: () => {} });

  assert.deepEqual(requests, [
    'categories',
    '3/groups',
    '3/23821/products',
    '3/23821/prices',
    '3/1938/products',
    '68/groups',
    '68/1/products',
  ]);
  assert.deepEqual(result.games, ['pokemon', 'one-piece']);
  assert.deepEqual(result.missing, []);
  assert.equal(result.products, 3);
  assert.equal(result.priced, 2);
  assert.deepEqual(result.failedGroups, ['one-piece: Romance Dawn']);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'sync_catalog_products');
  assert.deepEqual(calls[0][1].p_rows.map((row) => row.source_id), ['593355', '593354', '610002']);
});

test('sealed rows fit the database', { skip: !process.env.DATABASE_URL }, () => {
  const rows = prismatic();
  const sql = `
    begin;
    select public.sync_catalog_products($rows$${JSON.stringify(rows)}$rows$::jsonb);
    select count(*) from public.catalog_items where source = 'tcgcsv' and source_id in ('593355', '593354', '610002') and status = 'approved';
    rollback;
  `;
  const out = execFileSync('psql', [process.env.DATABASE_URL, '-v', 'ON_ERROR_STOP=1', '-tA', '-c', sql], { encoding: 'utf8' });
  assert.match(out, /^3$/m);
});
