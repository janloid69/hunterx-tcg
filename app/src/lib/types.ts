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
  /** The HunterX bot DMs them on Discord about messages and deals. */
  discord_dms?: boolean;
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

// ---------------------------------------------------------------------------
// Marketplace
// ---------------------------------------------------------------------------

export type PaymentMethod = 'GCash' | 'Maya' | 'Bank transfer' | 'Cash';
export type ListingStatus = 'active' | 'reserved' | 'sold' | 'removed';
export type ListingKind = 'card' | 'graded' | 'sealed' | 'item';

export type MemberSummary = {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  is_verified_seller: boolean;
  is_mod: boolean;
  in_guild: boolean;
  created_at?: string;
};

export type Listing = {
  id: string;
  seller_id: string;
  game_id: string;
  card_id: string | null;
  catalog_item_id: string | null;
  title: string;
  description: string | null;
  kind: ListingKind;
  condition: Condition | null;
  grader: Grader | null;
  grade: number | null;
  price: number;
  quantity: number;
  photos: string[];
  meetup: boolean;
  meetup_area: string | null;
  shipping: boolean;
  payment_methods: PaymentMethod[];
  status: ListingStatus;
  sold_price: number | null;
  sold_at: string | null;
  buyer_id: string | null;
  hidden_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ListingWithRefs = Listing & {
  seller: MemberSummary | null;
  card: { id: string; name: string; number: string; rarity: string | null; image_small: string | null; image_large: string | null; set: { name: string; code: string | null } | null } | null;
  item: { id: string; name: string; brand: string | null; line: string | null; image_url: string | null } | null;
};

export type InboxRow = {
  id: string;
  listing_id: string;
  created_at: string;
  last_message_at: string;
  my_role: 'buyer' | 'seller';
  other_id: string;
  other_name: string | null;
  other_username: string | null;
  other_avatar: string | null;
  other_verified: boolean;
  listing_title: string | null;
  listing_photo: string | null;
  listing_card_image: string | null;
  listing_game_id: string | null;
  listing_status: ListingStatus | null;
  listing_price: number | null;
  last_kind: 'text' | 'offer' | 'system' | null;
  last_body: string | null;
  last_offer_amount: number | null;
  last_sender_id: string | null;
  unread_count: number;
};

export type Conversation = {
  id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  created_at: string;
  last_message_at: string;
};

export type OfferStatus = 'pending' | 'accepted' | 'declined' | 'withdrawn';

export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  kind: 'text' | 'offer' | 'system';
  body: string | null;
  offer_amount: number | null;
  offer_status: OfferStatus | null;
  created_at: string;
};

export type Vouch = {
  id: string;
  listing_id: string;
  author_id: string;
  subject_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  author?: Pick<MemberSummary, 'id' | 'display_name' | 'username' | 'avatar_url'> | null;
};

export type MemberStats = {
  id: string;
  vouch_count: number;
  rating_avg: number | null;
  active_listings: number;
  sold_listings: number;
};

export type ReportReason = 'scam' | 'fake' | 'prohibited' | 'harassment' | 'spam' | 'other';

export type Report = {
  id: string;
  reporter_id: string;
  listing_id: string | null;
  reported_user_id: string | null;
  message_id: string | null;
  reason: ReportReason;
  details: string | null;
  snapshot: string | null;
  status: 'open' | 'resolved' | 'dismissed';
  created_at: string;
  reporter?: Pick<MemberSummary, 'id' | 'display_name' | 'username'> | null;
  reported?: Pick<MemberSummary, 'id' | 'display_name' | 'username'> | null;
  listing?: Pick<Listing, 'id' | 'title' | 'status' | 'hidden_at'> | null;
};
