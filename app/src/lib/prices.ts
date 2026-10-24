// The peso price guide: HunterX prices (what cards sold for here) and global
// reference prices (TCGplayer / Cardmarket converted to pesos).

import { supabase } from './supabase';
import type { Condition, Grader } from './types';

export type CardPrice = {
  card_id: string;
  /** Median of recent raw NM/LP sales on HunterX, in pesos. */
  local_php: number | null;
  local_sales: number;
  local_low: number | null;
  local_high: number | null;
  last_sold_php: number | null;
  last_sold_at: string | null;
  /** TCGplayer or Cardmarket market price converted to pesos. */
  global_php: number | null;
  global_source: 'TCGplayer' | 'Cardmarket' | null;
  global_updated_at: string | null;
  /** HunterX price when there is one, else the global price. */
  value_php: number | null;
};

export type CardSale = {
  id: string;
  price: number;
  kind: 'card' | 'graded' | string;
  condition: Condition | null;
  grader: Grader | null;
  grade: number | null;
  sold_at: string;
  source: 'market' | 'logged';
  mine: boolean;
  can_remove: boolean;
};

export type RecentSale = {
  id: string;
  card_id: string;
  price: number;
  kind: string;
  condition: Condition | null;
  grader: Grader | null;
  grade: number | null;
  sold_at: string;
  source: 'market' | 'logged';
  name: string;
  number: string;
  image_small: string | null;
  game_id: string;
  set_name: string | null;
};

export type CollectionValue = { value_php: number; priced_cards: number; raw_cards: number };

const num = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value));

function normalize(row: Record<string, unknown>): CardPrice {
  return {
    card_id: String(row.card_id),
    local_php: num(row.local_php),
    local_sales: Number(row.local_sales ?? 0),
    local_low: num(row.local_low),
    local_high: num(row.local_high),
    last_sold_php: num(row.last_sold_php),
    last_sold_at: (row.last_sold_at as string | null) ?? null,
    global_php: num(row.global_php),
    global_source: (row.global_source as CardPrice['global_source']) ?? null,
    global_updated_at: (row.global_updated_at as string | null) ?? null,
    value_php: num(row.value_php),
  };
}

export async function getCardPrice(cardId: string): Promise<CardPrice | null> {
  const { data, error } = await supabase.from('card_prices').select('*').eq('card_id', cardId).maybeSingle();
  if (error) throw error;
  return data ? normalize(data as Record<string, unknown>) : null;
}

/** Prices for many cards at once (in batches, to keep web addresses short). */
export async function getCardPrices(cardIds: string[]): Promise<Map<string, CardPrice>> {
  const ids = [...new Set(cardIds.filter(Boolean))];
  const prices = new Map<string, CardPrice>();
  for (let i = 0; i < ids.length; i += 80) {
    const { data, error } = await supabase.from('card_prices').select('*').in('card_id', ids.slice(i, i + 80));
    if (error) throw error;
    for (const row of (data ?? []) as Record<string, unknown>[]) {
      const price = normalize(row);
      prices.set(price.card_id, price);
    }
  }
  return prices;
}

export async function getCardSales(cardId: string): Promise<CardSale[]> {
  const { data, error } = await supabase.rpc('card_sales', { p_card_id: cardId, p_limit: 30 });
  if (error) throw error;
  return ((data ?? []) as CardSale[]).map((sale) => ({ ...sale, price: Number(sale.price), grade: num(sale.grade) }));
}

export type NewSale = {
  cardId: string;
  price: number;
  kind: 'card' | 'graded';
  condition?: Condition | null;
  grader?: Grader | null;
  grade?: number | null;
  soldOn?: string | null; // YYYY-MM-DD
};

export async function logSale(sale: NewSale): Promise<void> {
  const { error } = await supabase.rpc('log_sale', {
    p_card_id: sale.cardId,
    p_price: sale.price,
    p_kind: sale.kind,
    p_condition: sale.kind === 'card' ? sale.condition ?? 'NM' : null,
    p_grader: sale.kind === 'graded' ? sale.grader ?? null : null,
    p_grade: sale.kind === 'graded' ? sale.grade ?? null : null,
    p_sold_on: sale.soldOn ?? null,
  });
  if (error) throw error;
}

export async function removeLoggedSale(saleId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_logged_sale', { p_sale_id: saleId });
  if (error) throw error;
}

export async function getCollectionValue(): Promise<CollectionValue> {
  const { data, error } = await supabase.from('my_collection_value').select('*').maybeSingle();
  if (error) throw error;
  const row = (data ?? {}) as Record<string, unknown>;
  return {
    value_php: Number(row.value_php ?? 0),
    priced_cards: Number(row.priced_cards ?? 0),
    raw_cards: Number(row.raw_cards ?? 0),
  };
}

export async function getRecentSales(options: { gameId?: string; limit?: number } = {}): Promise<RecentSale[]> {
  let query = supabase.from('recent_sales').select('*').order('sold_at', { ascending: false }).limit(options.limit ?? 20);
  if (options.gameId && options.gameId !== 'all') query = query.eq('game_id', options.gameId);
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as RecentSale[]).map((sale) => ({ ...sale, price: Number(sale.price), grade: num(sale.grade) }));
}

/** "PSA 10", "Near mint", "Lightly played" ... for a sale. */
export function saleLabel(sale: Pick<CardSale, 'kind' | 'condition' | 'grader' | 'grade'>, conditionNames: Record<string, string>): string {
  if (sale.kind === 'graded') return [sale.grader, sale.grade].filter((part) => part !== null && part !== undefined).join(' ') || 'Graded';
  return conditionNames[sale.condition ?? 'NM'] ?? 'Raw';
}

/** Today in the Philippines as YYYY-MM-DD. */
export function manilaDate(offsetDays = 0, now = new Date()): string {
  const manila = new Date(now.getTime() + 8 * 3_600_000 - offsetDays * 86_400_000);
  return manila.toISOString().slice(0, 10);
}
