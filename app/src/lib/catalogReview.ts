// Mods reviewing the toys and sealed products members add to the catalog.

import { supabase } from './supabase';
import type { CatalogItem } from './types';

export type CatalogQueueItem = {
  id: string;
  kind: 'toy' | 'sealed';
  game_id: string;
  name: string;
  brand: string | null;
  line: string | null;
  image_url: string | null;
  created_at: string;
  added_by: string | null;
  added_by_name: string | null;
  in_binders: number;
  in_listings: number;
};

export async function getCatalogQueue(): Promise<CatalogQueueItem[]> {
  const { data, error } = await supabase.rpc('mod_catalog_queue');
  if (error) throw error;
  return (data ?? []) as CatalogQueueItem[];
}

export async function saveCatalogItem(
  id: string,
  fields: { name: string; brand?: string | null; line?: string | null },
  approve = true,
): Promise<void> {
  const { error } = await supabase.rpc('mod_save_catalog_item', {
    p_id: id,
    p_name: fields.name,
    p_brand: fields.brand ?? null,
    p_line: fields.line ?? null,
    p_approve: approve,
  });
  if (error) throw error;
}

export async function mergeCatalogItem(fromId: string, intoId: string): Promise<void> {
  const { error } = await supabase.rpc('mod_merge_catalog_item', { p_from: fromId, p_into: intoId });
  if (error) throw error;
}

export async function removeCatalogItem(id: string): Promise<void> {
  const { error } = await supabase.rpc('mod_remove_catalog_item', { p_id: id });
  if (error) throw error;
}

/** Approved items of one type, to pick the right one when merging a duplicate. */
export async function searchApprovedCatalog(kind: 'toy' | 'sealed', term: string, excludeId: string): Promise<CatalogItem[]> {
  const clean = term.replace(/[^\p{L}\p{N}\s'./-]/gu, '').trim().slice(0, 60);
  if (clean.length < 2) return [];
  const { data, error } = await supabase
    .from('catalog_items')
    .select('id, game_id, kind, name, brand, line, image_url, status')
    .eq('kind', kind)
    .eq('status', 'approved')
    .neq('id', excludeId)
    .ilike('name', `%${clean}%`)
    .limit(20);
  if (error) throw error;
  return (data ?? []) as CatalogItem[];
}
