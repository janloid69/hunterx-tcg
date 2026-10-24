// Finds card numbers in text read from a photo (or typed by a member):
//   One Piece  OP01-120, ST10-005, EB01-012, PRB01-001, P-001
//   Pokémon    238/191, 001/198, TG01/TG30, plus a set code like "SSP EN" on newer cards
// Text from a camera has mix-ups like O/0, I/1, S/5 and B/8, so digits are
// cleaned up before matching. No imports: tested on its own with Node.

export type ScanGuess =
  | { game: 'one-piece'; number: string; key: string }
  | { game: 'pokemon'; number: string; total: string | null; setCode: string | null; key: string };

const DIGITS: Record<string, string> = { O: '0', Q: '0', D: '0', I: '1', L: '1', T: '7', Z: '2', S: '5', G: '6', B: '8' };
const LOOKS_LIKE_DIGIT = '0-9OQDILTZSGB';

/** "O1" -> "01", "2S8" -> "258". Returns null if anything isn't a digit after fixing. */
function toDigits(text: string): string | null {
  const fixed = text
    .toUpperCase()
    .split('')
    .map((ch) => DIGITS[ch] ?? ch)
    .join('');
  return /^\d+$/.test(fixed) ? fixed : null;
}

function onePieceGuesses(text: string): ScanGuess[] {
  const guesses: ScanGuess[] = [];
  const pattern = new RegExp(
    `(?:^|[^A-Z0-9])(PR[B8]|[O0]P|[S5]T|E[B8])\\s?([${LOOKS_LIKE_DIGIT}]{2})\\s?[-–—~_.]?\\s?([${LOOKS_LIKE_DIGIT}]{3})(?![0-9])`,
    'g',
  );
  for (const match of text.matchAll(pattern)) {
    const prefix = match[1].replace('0', 'O').replace('5', 'S').replace('8', 'B');
    const set = toDigits(match[2]);
    const card = toDigits(match[3]);
    if (!set || !card) continue;
    const number = `${prefix}${set}-${card}`;
    guesses.push({ game: 'one-piece', number, key: `one-piece:${number}` });
  }
  // Promo cards: P-001
  for (const match of text.matchAll(new RegExp(`(?:^|[^A-Z0-9])P\\s?[-–—]\\s?([${LOOKS_LIKE_DIGIT}]{3})(?![0-9])`, 'g'))) {
    const card = toDigits(match[1]);
    if (card) guesses.push({ game: 'one-piece', number: `P-${card}`, key: `one-piece:P-${card}` });
  }
  return guesses;
}

/** "001" -> "1"; "TG01" stays "TG01". */
export function pokemonNumber(text: string): string {
  const prefixed = text.match(/^([A-Z]{1,3})(\d+)$/);
  if (prefixed) return `${prefixed[1]}${prefixed[2]}`;
  return String(Number(text));
}

function pokemonGuesses(text: string): ScanGuess[] {
  const guesses: ScanGuess[] = [];
  // Set code on Scarlet & Violet era cards: "SSP EN 238/191" or "PAL EN".
  const code = text.match(/(?:^|[^A-Z])([A-Z]{3})\s?EN(?![A-Z])/)?.[1] ?? null;

  const pattern = new RegExp(
    `(?:^|[^A-Z0-9])(TG|GG|SV|RC|H)?([${LOOKS_LIKE_DIGIT}]{1,3})\\s?[/|\\\\]\\s?(TG|GG|SV|RC|H)?([${LOOKS_LIKE_DIGIT}]{2,3})(?![0-9])`,
    'g',
  );
  for (const match of text.matchAll(pattern)) {
    const digits = toDigits(match[2]);
    const totalDigits = toDigits(match[4]);
    if (!digits || !totalDigits) continue;
    if (Number(totalDigits) === 0) continue;
    const number = pokemonNumber(`${match[1] ?? ''}${digits}`);
    const total = `${match[3] ?? ''}${match[3] ? totalDigits : String(Number(totalDigits))}`;
    guesses.push({ game: 'pokemon', number, total, setCode: code, key: `pokemon:${code ?? ''}:${number}/${total}` });
  }
  return guesses;
}

/** Card numbers found in the text, most likely first, without repeats. */
export function parseScanText(raw: string): ScanGuess[] {
  const text = ` ${String(raw ?? '').toUpperCase().replace(/\s+/g, ' ')} `;
  const guesses = [...onePieceGuesses(text), ...pokemonGuesses(text)];
  const seen = new Set<string>();
  return guesses.filter((guess) => (seen.has(guess.key) ? false : (seen.add(guess.key), true)));
}

/**
 * What a member typed: anything parseScanText understands, plus a bare
 * Pokémon number like "238" or "SSP 238".
 */
export function parseTypedNumber(raw: string): ScanGuess[] {
  const found = parseScanText(raw);
  if (found.length) return found;
  const text = String(raw ?? '').toUpperCase().trim();
  const bare = text.match(/^(?:([A-Z]{3})\s+)?#?\s?(TG|GG|SV|RC|H)?(\d{1,3})$/);
  if (!bare) return [];
  const setCode = bare[1] ?? null;
  const number = pokemonNumber(`${bare[2] ?? ''}${bare[3]}`);
  return [{ game: 'pokemon', number, total: null, setCode, key: `pokemon:${setCode ?? ''}:${number}` }];
}
