// Turns a card number read by the scanner into matching cards.

import type { ScanGuess } from './scanParse';
import { supabase } from './supabase';
import type { CardWithSet } from './types';

const CARD_FIELDS = 'id, game_id, set_id, number, name, rarity, image_small, image_large';

type Row = Omit<CardWithSet, 'set'> & { card_sets: { name: string; code: string | null } | null };
const withSet = (rows: Row[]): CardWithSet[] => rows.map(({ card_sets, ...card }) => ({ ...card, set: card_sets }));

/** The number as stored, plus the zero-padded spellings some sets use ("1", "001"). */
function numberSpellings(number: string): string[] {
  const plain = number.match(/^(\D*)(\d+)$/);
  if (!plain) return [number];
  const [, prefix, digits] = plain;
  const trimmed = String(Number(digits));
  return [...new Set([number, `${prefix}${trimmed}`, `${prefix}${trimmed.padStart(2, '0')}`, `${prefix}${trimmed.padStart(3, '0')}`])];
}

async function query(build: (q: ReturnType<typeof base>) => ReturnType<typeof base>): Promise<CardWithSet[]> {
  const { data, error } = await build(base());
  if (error) throw error;
  return withSet((data ?? []) as unknown as Row[]);
}

function base() {
  return supabase.from('cards').select(`${CARD_FIELDS}, card_sets!inner ( name, code, printed_total, card_count )`).limit(30);
}

/** Cards matching a scanned number, best matches first. Empty if none. */
export async function findCardsForGuess(guess: ScanGuess): Promise<CardWithSet[]> {
  if (guess.game === 'one-piece') {
    return query((q) => q.eq('game_id', 'one-piece').eq('number', guess.number).order('id'));
  }

  const numbers = numberSpellings(guess.number);
  const pokemon = (q: ReturnType<typeof base>) => q.eq('game_id', 'pokemon').in('number', numbers);

  if (guess.setCode) {
    const exact = await query((q) => pokemon(q).eq('card_sets.code', guess.setCode!));
    if (exact.length) return exact;
  }
  if (guess.total && /^\d+$/.test(guess.total)) {
    const total = Number(guess.total);
    const bySet = await query((q) =>
      pokemon(q).or(`printed_total.eq.${total},card_count.eq.${total}`, { referencedTable: 'card_sets' }),
    );
    if (bySet.length) return bySet;
  }
  if (guess.total && !/^\d+$/.test(guess.total)) {
    // Trainer Gallery and similar: "TG01/TG30" has no set-wide total to match.
    return query((q) => pokemon(q).order('set_id', { ascending: false }));
  }
  // Number only: newest sets first.
  return query((q) => pokemon(q).order('set_id', { ascending: false }));
}

/** Tries each guess in order until one matches. */
export async function findCards(guesses: ScanGuess[]): Promise<{ guess: ScanGuess | null; cards: CardWithSet[] }> {
  for (const guess of guesses.slice(0, 4)) {
    const cards = await findCardsForGuess(guess);
    if (cards.length) return { guess, cards };
  }
  return { guess: guesses[0] ?? null, cards: [] };
}
