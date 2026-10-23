#!/usr/bin/env node
// Copies card data from free community APIs into Supabase.
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/sync-cards/index.mjs [game...]
//
// Games: pokemon, one-piece, riftbound (default: all). Runs nightly from
// .github/workflows/sync-cards.yml. One failing source doesn't stop the others.

import { createDb } from './lib.mjs';
import { syncOnePiece } from './sources/one-piece.mjs';
import { syncPokemon } from './sources/pokemon.mjs';
import { syncRiftbound } from './sources/riftbound.mjs';

const SOURCES = {
  pokemon: (db) => syncPokemon(db, { apiKey: process.env.POKEMONTCG_API_KEY }),
  'one-piece': (db) => syncOnePiece(db),
  riftbound: (db) => syncRiftbound(db),
};

const requested = process.argv.slice(2);
const games = requested.length > 0 ? requested : Object.keys(SOURCES);
const unknown = games.filter((game) => !(game in SOURCES));
if (unknown.length > 0) {
  console.error(`Unknown game(s): ${unknown.join(', ')}. Use: ${Object.keys(SOURCES).join(', ')}`);
  process.exit(2);
}

const db = createDb({
  url: process.env.SUPABASE_URL,
  serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
});

let failures = 0;
for (const game of games) {
  const started = Date.now();
  try {
    await SOURCES[game](db);
    console.log(`✓ ${game} done in ${Math.round((Date.now() - started) / 1000)}s`);
  } catch (error) {
    failures += 1;
    console.error(`✗ ${game} failed: ${error instanceof Error ? error.message : error}`);
  }
}
process.exit(failures > 0 ? 1 : 0);
