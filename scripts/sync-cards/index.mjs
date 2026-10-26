#!/usr/bin/env node
// Copies card data from free community APIs into Supabase.
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/sync-cards/index.mjs [game...]
//
// Games: pokemon, one-piece, riftbound. With no games named, it syncs the games
// switched on in the games table (games.enabled), so hiding a game on the site
// also pauses its sync. Runs nightly from .github/workflows/sync-cards.yml.
// One failing source doesn't stop the others.
//
// Also refreshes exchange rates and global card prices for the price guide.
// Pokémon re-downloads every set once a week (Saturday night UTC, Sunday
// morning in the Philippines) so older sets' prices stay current, or whenever
// FULL_REFRESH=true.
//
// Sealed products and their prices (tcgcsv.com) refresh on the same weekly
// run, on the first run after the sealed prices migration, or when "sealed" is
// named: node scripts/sync-cards/index.mjs sealed

import { createDb } from './lib.mjs';
import { syncFxRates } from './sources/fx.mjs';
import { syncOnePiece } from './sources/one-piece.mjs';
import { syncPokemon } from './sources/pokemon.mjs';
import { syncRiftbound } from './sources/riftbound.mjs';
import { SEALED_GAMES, SOURCE as SEALED_SOURCE, syncSealed } from './sources/sealed.mjs';

const fullRefresh = process.env.FULL_REFRESH === 'true' || new Date().getUTCDay() === 6;

// Quick sources first, so their cards show up while Pokémon is still loading.
const SOURCES = {
  'one-piece': (db, options) => syncOnePiece(db, options),
  riftbound: (db) => syncRiftbound(db),
  pokemon: (db, options) => syncPokemon(db, { ...options, apiKey: process.env.POKEMONTCG_API_KEY, fullRefresh }),
};

// In GitHub Actions, results also appear as notes on the run's summary page.
const inActions = process.env.GITHUB_ACTIONS === 'true';
const oneLine = (text) => String(text).replace(/\r?\n/g, ' ').slice(0, 900);
function report(level, game, message) {
  if (inActions) console.log(`::${level} title=${game}::${oneLine(message)}`);
}

const args = process.argv.slice(2);
const sealedRequested = args.includes('sealed');
const requested = args.filter((name) => name !== 'sealed');
const unknown = requested.filter((game) => !(game in SOURCES));
if (unknown.length > 0) {
  console.error(`Unknown game(s): ${unknown.join(', ')}. Use: ${Object.keys(SOURCES).join(', ')}, sealed`);
  process.exit(2);
}

const db = createDb({
  url: process.env.SUPABASE_URL,
  serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
});

const enabled = new Set((await db.select('games', 'select=id&enabled=eq.true')).map((row) => row.id));
// "sealed" on its own syncs only sealed products.
let games = sealedRequested && requested.length === 0 ? [] : requested;
if (games.length === 0 && !sealedRequested) {
  games = Object.keys(SOURCES).filter((game) => enabled.has(game));
  const paused = Object.keys(SOURCES).filter((game) => !enabled.has(game));
  if (paused.length > 0) {
    console.log(`Skipping games hidden on the site: ${paused.join(', ')}`);
    report('notice', 'skipped', `Not syncing games hidden on the site: ${paused.join(', ')}`);
  }
}

let failures = 0;

// Prices need the price guide migration (20261026000000_price_guide.sql).
const withPrices = await db.hasColumn('cards', 'market_usd');
if (!withPrices) {
  const message = 'Prices are off: run supabase/migrations/20261026000000_price_guide.sql in Supabase to turn on the price guide.';
  console.log(message);
  report('warning', 'prices', message);
} else {
  try {
    const rates = await syncFxRates(db);
    report('notice', 'exchange rates', rates.map((row) => `1 ${row.currency} = ₱${row.php.toFixed(2)}`).join(', '));
  } catch (error) {
    const message = `Couldn't update exchange rates (yesterday's stay in use): ${error instanceof Error ? error.message : error}`;
    console.error(message);
    report('warning', 'exchange rates', message);
  }
}

for (const game of games) {
  const started = Date.now();
  try {
    const result = await SOURCES[game](db, { withPrices });
    const seconds = Math.round((Date.now() - started) / 1000);
    console.log(`✓ ${game} done in ${seconds}s`);
    const totalCards = await db.count('cards', `game_id=eq.${game}`).catch(() => null);
    report(
      'notice',
      game,
      `Saved ${result?.sets ?? '?'} sets and ${result?.cards ?? '?'} cards in ${seconds}s` +
        (result?.priced !== undefined ? `, ${result.priced} with a global price` : '') +
        (totalCards === null ? '' : ` (${totalCards} ${game} cards in the database)`),
    );
    if (result?.failedSets?.length) {
      report('warning', game, `${result.failedSets.length} sets didn't download and will retry next run: ${result.failedSets.join(', ')}`);
    }
  } catch (error) {
    failures += 1;
    const message = error instanceof Error ? error.message : String(error);
    console.error(`✗ ${game} failed: ${message}`);
    report('error', game, message);
  }
}
// Sealed products: weekly, on the first run after the migration, or when asked.
const withSealed = await db.hasColumn('catalog_items', 'market_usd');
if (!withSealed) {
  if (sealedRequested) {
    failures += 1;
    report('error', 'sealed', 'Run supabase/migrations/20261028000000_sealed_prices.sql in Supabase first.');
  }
} else {
  const firstRun = (await db.count('catalog_items', `source=eq.${SEALED_SOURCE}`).catch(() => null)) === 0;
  if (sealedRequested || fullRefresh || firstRun) {
    const started = Date.now();
    const sealedGames = SEALED_GAMES.filter((game) => enabled.has(game));
    try {
      const result = await syncSealed(db, { games: sealedGames });
      const minutes = Math.round((Date.now() - started) / 6000) / 10;
      console.log(`✓ sealed done in ${minutes} min`);
      report(
        'notice',
        'sealed',
        `Saved ${result.products} sealed products (${result.priced} with a TCGplayer price) for ${result.games.join(', ') || 'no games'} in ${minutes} min`,
      );
      if (result.missing.length) report('warning', 'sealed', `TCGCSV has no category for: ${result.missing.join(', ')}`);
      if (result.failedGroups.length) {
        report('warning', 'sealed', `${result.failedGroups.length} sets didn't download and will retry next week: ${result.failedGroups.slice(0, 20).join('; ')}`);
      }
    } catch (error) {
      failures += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`✗ sealed failed: ${message}`);
      report('error', 'sealed', message);
    }
  }
}

process.exit(failures > 0 ? 1 : 0);
