#!/usr/bin/env node
// Copies card data from free community APIs into Supabase.
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/sync-cards/index.mjs [game...]
//
// Games: pokemon, one-piece, riftbound. With no games named, it syncs the games
// switched on in the games table (games.enabled), so hiding a game on the site
// also pauses its sync. Runs nightly from .github/workflows/sync-cards.yml.
// One failing source doesn't stop the others.

import { createDb } from './lib.mjs';
import { syncOnePiece } from './sources/one-piece.mjs';
import { syncPokemon } from './sources/pokemon.mjs';
import { syncRiftbound } from './sources/riftbound.mjs';

// Quick sources first, so their cards show up while Pokémon is still loading.
const SOURCES = {
  'one-piece': (db) => syncOnePiece(db),
  riftbound: (db) => syncRiftbound(db),
  pokemon: (db) => syncPokemon(db, { apiKey: process.env.POKEMONTCG_API_KEY }),
};

// In GitHub Actions, results also appear as notes on the run's summary page.
const inActions = process.env.GITHUB_ACTIONS === 'true';
const oneLine = (text) => String(text).replace(/\r?\n/g, ' ').slice(0, 900);
function report(level, game, message) {
  if (inActions) console.log(`::${level} title=${game}::${oneLine(message)}`);
}

const requested = process.argv.slice(2);
const unknown = requested.filter((game) => !(game in SOURCES));
if (unknown.length > 0) {
  console.error(`Unknown game(s): ${unknown.join(', ')}. Use: ${Object.keys(SOURCES).join(', ')}`);
  process.exit(2);
}

const db = createDb({
  url: process.env.SUPABASE_URL,
  serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
});

let games = requested;
if (games.length === 0) {
  const enabled = new Set((await db.select('games', 'select=id&enabled=eq.true')).map((row) => row.id));
  games = Object.keys(SOURCES).filter((game) => enabled.has(game));
  const paused = Object.keys(SOURCES).filter((game) => !enabled.has(game));
  if (paused.length > 0) {
    console.log(`Skipping games hidden on the site: ${paused.join(', ')}`);
    report('notice', 'skipped', `Not syncing games hidden on the site: ${paused.join(', ')}`);
  }
}

let failures = 0;
for (const game of games) {
  const started = Date.now();
  try {
    const result = await SOURCES[game](db);
    const seconds = Math.round((Date.now() - started) / 1000);
    console.log(`✓ ${game} done in ${seconds}s`);
    const totalCards = await db.count('cards', `game_id=eq.${game}`).catch(() => null);
    report(
      'notice',
      game,
      `Saved ${result?.sets ?? '?'} sets and ${result?.cards ?? '?'} cards in ${seconds}s` +
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
process.exit(failures > 0 ? 1 : 0);
