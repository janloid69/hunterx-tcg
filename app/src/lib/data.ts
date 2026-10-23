import { supabase } from './supabase';
import type {
  CardWithSet,
  CardSet,
  Card,
  CatalogItem,
  CollectionItem,
  CollectionItemWithRefs,
  Condition,
  Game,
  Grader,
  ItemKind,
  SetProgress,
} from './types';

// ---------------------------------------------------------------------------
// Games
// ---------------------------------------------------------------------------

export async function getGames(): Promise<Game[]> {
  const { data, error } = await supabase
    .from('games')
    .select('*')
    .eq('enabled', true)
    .order('sort_order');
  if (error) throw error;
  return (data ?? []) as Game[];
}

// ---------------------------------------------------------------------------
// Binder summary and progress
// ---------------------------------------------------------------------------

export type CollectionSummary = {
  totalQuantity: number;
  cards: number;
  graded: number;
  sealed: number;
  items: number;
  spent: number;
};

export async function getCollectionSummary(): Promise<CollectionSummary> {
  const { data, error } = await supabase
    .from('collection_items')
    .select('kind, quantity, price_paid');
  if (error) throw error;

  const summary: CollectionSummary = {
    totalQuantity: 0,
    cards: 0,
    graded: 0,
    sealed: 0,
    items: 0,
    spent: 0,
  };
  for (const row of (data ?? []) as Pick<CollectionItem, 'kind' | 'quantity' | 'price_paid'>[]) {
    summary.totalQuantity += row.quantity;
    if (row.kind === 'card') summary.cards += row.quantity;
    if (row.kind === 'graded') summary.graded += row.quantity;
    if (row.kind === 'sealed') summary.sealed += row.quantity;
    if (row.kind === 'item') summary.items += row.quantity;
    summary.spent += Number(row.price_paid ?? 0) * row.quantity;
  }
  return summary;
}

const ITEM_WITH_REFS = `
  id, card_id, catalog_item_id, kind, quantity, condition, grader, grade, price_paid, created_at,
  card:cards ( id, name, number, image_small, game_id, set_id, set:card_sets ( name, code ) ),
  item:catalog_items ( id, name, brand, line, game_id, kind, image_url )
`;

export async function getRecentItems(limit = 6): Promise<CollectionItemWithRefs[]> {
  const { data, error } = await supabase
    .from('collection_items')
    .select(ITEM_WITH_REFS)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as CollectionItemWithRefs[];
}

export async function getOtherCollectibles(): Promise<CollectionItemWithRefs[]> {
  const { data, error } = await supabase
    .from('collection_items')
    .select(ITEM_WITH_REFS)
    .in('kind', ['sealed', 'item'])
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as CollectionItemWithRefs[];
}

export async function getSetProgress(): Promise<SetProgress[]> {
  const { data, error } = await supabase
    .from('my_set_progress')
    .select('*')
    .order('release_date', { ascending: false, nullsFirst: false });
  if (error) throw error;
  return (data ?? []) as SetProgress[];
}

// ---------------------------------------------------------------------------
// A single set and the member's copies in it
// ---------------------------------------------------------------------------

export async function getSet(setId: string): Promise<CardSet | null> {
  const { data, error } = await supabase.from('card_sets').select('*').eq('id', setId).maybeSingle();
  if (error) throw error;
  return (data as CardSet | null) ?? null;
}

export async function getSetCards(setId: string): Promise<Card[]> {
  const { data, error } = await supabase
    .from('cards')
    .select('id, game_id, set_id, number, name, rarity, image_small, image_large')
    .eq('set_id', setId)
    .order('sort_number', { ascending: true, nullsFirst: false })
    .order('number', { ascending: true })
    .limit(1000);
  if (error) throw error;
  return (data ?? []) as Card[];
}

export async function getMyCopiesInSet(setId: string): Promise<CollectionItem[]> {
  const { data, error } = await supabase
    .from('collection_items')
    .select('id, card_id, catalog_item_id, kind, quantity, condition, grader, grade, price_paid, created_at, cards!inner ( set_id )')
    .eq('cards.set_id', setId);
  if (error) throw error;
  return (data ?? []) as unknown as CollectionItem[];
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/** Keeps letters, numbers, spaces and a few safe symbols for search terms. */
function cleanTerm(term: string): string {
  return term.replace(/[^\p{L}\p{N}\s'./-]/gu, '').trim().slice(0, 60);
}

/** "223/197", "#223" and "OP01-001" all count as card numbers. */
export function parseCardNumber(term: string): string | null {
  const match = term.trim().match(/^#?\s*([A-Za-z]{0,6}\d{0,3}-?\d+[A-Za-z]?)(\s*\/\s*\d+)?$/);
  return match ? match[1] : null;
}

export async function searchCards(gameId: string, term: string): Promise<CardWithSet[]> {
  const clean = cleanTerm(term);
  if (clean.length < 2 && !parseCardNumber(clean)) return [];

  let query = supabase
    .from('cards')
    .select('id, game_id, set_id, number, name, rarity, image_small, image_large, set:card_sets ( name, code )')
    .eq('game_id', gameId)
    .limit(40);

  const number = parseCardNumber(clean);
  query = number ? query.ilike('number', `%${number}%`) : query.ilike('name', `%${clean}%`);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as CardWithSet[];
}

export async function searchCatalog(kind: 'toy' | 'sealed', term: string): Promise<CatalogItem[]> {
  const clean = cleanTerm(term);
  if (clean.length < 2) return [];
  const { data, error } = await supabase
    .from('catalog_items')
    .select('id, game_id, kind, name, brand, line, image_url, status')
    .eq('kind', kind)
    .ilike('name', `%${clean}%`)
    .neq('status', 'merged')
    .limit(30);
  if (error) throw error;
  return (data ?? []) as CatalogItem[];
}

export async function getCard(id: string): Promise<CardWithSet | null> {
  const { data, error } = await supabase
    .from('cards')
    .select('id, game_id, set_id, number, name, rarity, image_small, image_large, set:card_sets ( name, code )')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as CardWithSet | null) ?? null;
}

export async function getCatalogItem(id: string): Promise<CatalogItem | null> {
  const { data, error } = await supabase
    .from('catalog_items')
    .select('id, game_id, kind, name, brand, line, image_url, status')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data as CatalogItem | null) ?? null;
}

export async function createCatalogItem(input: {
  kind: 'toy' | 'sealed';
  gameId: string;
  name: string;
  brand?: string;
  line?: string;
}): Promise<CatalogItem> {
  const { data, error } = await supabase
    .from('catalog_items')
    .insert({
      kind: input.kind,
      game_id: input.gameId,
      name: input.name.trim(),
      brand: input.brand?.trim() || null,
      line: input.line?.trim() || null,
    })
    .select('id, game_id, kind, name, brand, line, image_url, status')
    .single();
  if (error) throw error;
  return data as CatalogItem;
}

// ---------------------------------------------------------------------------
// Changing the binder
// ---------------------------------------------------------------------------

export type NewCollectionItem = {
  cardId?: string;
  catalogItemId?: string;
  kind: ItemKind;
  quantity: number;
  condition?: Condition | null;
  grader?: Grader | null;
  grade?: number | null;
  pricePaid?: number | null;
};

export async function addToCollection(input: NewCollectionItem): Promise<void> {
  const { error } = await supabase.from('collection_items').insert({
    card_id: input.cardId ?? null,
    catalog_item_id: input.catalogItemId ?? null,
    kind: input.kind,
    quantity: input.quantity,
    condition: input.kind === 'graded' ? null : input.condition ?? 'NM',
    grader: input.kind === 'graded' ? input.grader ?? null : null,
    grade: input.kind === 'graded' ? input.grade ?? null : null,
    price_paid: input.pricePaid ?? null,
  });
  if (error) throw error;
}

export async function setQuantity(itemId: string, quantity: number): Promise<void> {
  const { error } = await supabase.from('collection_items').update({ quantity }).eq('id', itemId);
  if (error) throw error;
}

export async function removeFromCollection(itemId: string): Promise<void> {
  const { error } = await supabase.from('collection_items').delete().eq('id', itemId);
  if (error) throw error;
}
