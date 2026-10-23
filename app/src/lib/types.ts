export type Profile = {
  id: string;
  discord_id: string | null;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  in_guild: boolean;
  is_verified_seller: boolean;
  is_mod: boolean;
  roles_synced_at: string | null;
};

export type Game = {
  id: string;
  name: string;
  kind: 'tcg' | 'collectible';
  has_card_numbers: boolean;
  enabled: boolean;
  sort_order: number;
};

export type CardSet = {
  id: string;
  game_id: string;
  code: string | null;
  name: string;
  series: string | null;
  release_date: string | null;
  card_count: number | null;
  logo_url: string | null;
};

export type Card = {
  id: string;
  game_id: string;
  set_id: string;
  number: string;
  name: string;
  rarity: string | null;
  image_small: string | null;
  image_large: string | null;
};

export type CardWithSet = Card & { set: { name: string; code: string | null } | null };

export type CatalogItem = {
  id: string;
  game_id: string;
  kind: 'toy' | 'sealed';
  name: string;
  brand: string | null;
  line: string | null;
  image_url: string | null;
  status: 'pending' | 'approved' | 'merged';
};

export type ItemKind = 'card' | 'graded' | 'sealed' | 'item';
export type Condition = 'NM' | 'LP' | 'MP' | 'HP' | 'DMG';
export type Grader = 'PSA' | 'BGS' | 'CGC' | 'TAG' | 'Other';

export type CollectionItem = {
  id: string;
  card_id: string | null;
  catalog_item_id: string | null;
  kind: ItemKind;
  quantity: number;
  condition: Condition | null;
  grader: Grader | null;
  grade: number | null;
  price_paid: number | null;
  created_at: string;
};

export type CollectionItemWithRefs = CollectionItem & {
  card: (Pick<Card, 'id' | 'name' | 'number' | 'image_small' | 'game_id' | 'set_id'> & {
    set: { name: string; code: string | null } | null;
  }) | null;
  item: Pick<CatalogItem, 'id' | 'name' | 'brand' | 'line' | 'game_id' | 'kind' | 'image_url'> | null;
};

export type SetProgress = {
  set_id: string;
  game_id: string;
  name: string;
  code: string | null;
  release_date: string | null;
  total_cards: number;
  owned_cards: number;
  copies: number;
};
