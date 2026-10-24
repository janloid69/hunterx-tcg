import { supabase } from './supabase';
import type {
  Conversation,
  InboxRow,
  Listing,
  ListingKind,
  ListingStatus,
  ListingWithRefs,
  MemberStats,
  MemberSummary,
  Message,
  OfferStatus,
  PaymentMethod,
  Report,
  ReportReason,
  Condition,
  Grader,
  Vouch,
} from './types';

export const PHOTO_BUCKET = 'listing-photos';
export const MAX_PHOTOS = 6;
export const PAYMENT_METHODS: PaymentMethod[] = ['GCash', 'Maya', 'Bank transfer', 'Cash'];

const MEMBER_FIELDS = 'id, display_name, username, avatar_url, is_verified_seller, is_mod, in_guild, created_at';

const LISTING_WITH_REFS = `
  *,
  seller:profiles!listings_seller_id_fkey ( ${MEMBER_FIELDS} ),
  card:cards ( id, name, number, rarity, image_small, image_large, set:card_sets ( name, code ) ),
  item:catalog_items ( id, name, brand, line, image_url )
`;

/** Public web address of an uploaded listing photo. */
export function photoUrl(path: string): string {
  return supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Best picture for a listing: the seller's first photo, else the card or item image. */
export function listingImage(listing: Pick<ListingWithRefs, 'photos' | 'card' | 'item'>): string | null {
  if (listing.photos.length > 0) return photoUrl(listing.photos[0]);
  return listing.card?.image_small ?? listing.item?.image_url ?? null;
}

export async function currentUserId(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error('Please sign in again.');
  return id;
}

// ---------------------------------------------------------------------------
// Browsing and reading listings
// ---------------------------------------------------------------------------

export type ListingSort = 'newest' | 'price_low' | 'price_high';

function cleanSearch(term: string): string {
  return term.replace(/[^\p{L}\p{N}\s'./-]/gu, '').trim().slice(0, 60);
}

export async function getListings(options: {
  gameId?: string;
  cardId?: string;
  search?: string;
  sort?: ListingSort;
  limit?: number;
  offset?: number;
}): Promise<ListingWithRefs[]> {
  const { gameId, cardId, search = '', sort = 'newest', limit = 48, offset = 0 } = options;
  let query = supabase
    .from('listings')
    .select(LISTING_WITH_REFS)
    .in('status', ['active', 'reserved'])
    .is('hidden_at', null);

  if (gameId && gameId !== 'all') query = query.eq('game_id', gameId);
  if (cardId) query = query.eq('card_id', cardId);
  const term = cleanSearch(search);
  if (term.length >= 2) query = query.ilike('title', `%${term}%`);

  if (sort === 'price_low') query = query.order('price', { ascending: true });
  else if (sort === 'price_high') query = query.order('price', { ascending: false });
  query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as ListingWithRefs[];
}

export async function getListing(id: string): Promise<ListingWithRefs | null> {
  const { data, error } = await supabase.from('listings').select(LISTING_WITH_REFS).eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as unknown as ListingWithRefs | null) ?? null;
}

export async function getMyListings(): Promise<ListingWithRefs[]> {
  const me = await currentUserId();
  const { data, error } = await supabase
    .from('listings')
    .select(LISTING_WITH_REFS)
    .eq('seller_id', me)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as ListingWithRefs[];
}

export async function getMemberListings(memberId: string): Promise<ListingWithRefs[]> {
  const { data, error } = await supabase
    .from('listings')
    .select(LISTING_WITH_REFS)
    .eq('seller_id', memberId)
    .in('status', ['active', 'reserved'])
    .is('hidden_at', null)
    .order('created_at', { ascending: false })
    .limit(48);
  if (error) throw error;
  return (data ?? []) as unknown as ListingWithRefs[];
}

// ---------------------------------------------------------------------------
// Creating and editing listings
// ---------------------------------------------------------------------------

export type ListingInput = {
  gameId: string;
  cardId: string | null;
  catalogItemId: string | null;
  title: string;
  description: string;
  kind: ListingKind;
  condition: Condition | null;
  grader: Grader | null;
  grade: number | null;
  price: number;
  quantity: number;
  photos: string[];
  meetup: boolean;
  meetupArea: string;
  shipping: boolean;
  paymentMethods: PaymentMethod[];
};

function toRow(input: ListingInput) {
  return {
    game_id: input.gameId,
    card_id: input.cardId,
    catalog_item_id: input.catalogItemId,
    title: input.title.trim(),
    description: input.description.trim() || null,
    kind: input.kind,
    condition: input.kind === 'graded' ? null : input.condition,
    grader: input.kind === 'graded' ? input.grader : null,
    grade: input.kind === 'graded' ? input.grade : null,
    price: input.price,
    quantity: input.quantity,
    photos: input.photos,
    meetup: input.meetup,
    meetup_area: input.meetup ? input.meetupArea.trim() || null : null,
    shipping: input.shipping,
    payment_methods: input.paymentMethods,
  };
}

export async function createListing(input: ListingInput): Promise<string> {
  const { data, error } = await supabase.from('listings').insert(toRow(input)).select('id').single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function updateListing(id: string, input: ListingInput): Promise<void> {
  const { error } = await supabase.from('listings').update(toRow(input)).eq('id', id);
  if (error) throw error;
}

export async function setListingStatus(id: string, status: Exclude<ListingStatus, 'sold'>): Promise<void> {
  const { error } = await supabase.from('listings').update({ status }).eq('id', id);
  if (error) throw error;
}

export async function markSold(id: string, buyerId: string | null, soldPrice: number | null): Promise<void> {
  const { error } = await supabase
    .from('listings')
    .update({ status: 'sold', buyer_id: buyerId, sold_price: soldPrice })
    .eq('id', id);
  if (error) throw error;
}

/** People who messaged the seller about a listing (choices for "sold to"). */
export async function getListingBuyers(listingId: string): Promise<MemberSummary[]> {
  const { data, error } = await supabase
    .from('conversations')
    .select(`buyer:profiles!conversations_buyer_id_fkey ( ${MEMBER_FIELDS} )`)
    .eq('listing_id', listingId)
    .order('last_message_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as { buyer: MemberSummary | null }[])
    .map((row) => row.buyer)
    .filter((buyer): buyer is MemberSummary => buyer !== null);
}

// ---------------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------------

export async function uploadListingPhoto(photo: Blob): Promise<string> {
  const me = await currentUserId();
  const random = Math.random().toString(36).slice(2, 10);
  const path = `${me}/${Date.now()}-${random}.jpg`;
  const { error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, photo, { contentType: 'image/jpeg', upsert: false, cacheControl: '31536000' });
  if (error) throw error;
  return path;
}

export async function deleteListingPhotos(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await supabase.storage.from(PHOTO_BUCKET).remove(paths);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

/** The signed-in buyer's existing chat about a listing, if any. */
export async function findMyConversation(listingId: string): Promise<string | null> {
  const me = await currentUserId();
  const { data, error } = await supabase
    .from('conversations')
    .select('id')
    .eq('listing_id', listingId)
    .eq('buyer_id', me)
    .maybeSingle();
  if (error) throw error;
  return (data as { id: string } | null)?.id ?? null;
}

export async function startConversation(listingId: string): Promise<string> {
  const { data, error } = await supabase.rpc('start_conversation', { p_listing_id: listingId });
  if (error) throw error;
  return data as string;
}

export async function getInbox(): Promise<InboxRow[]> {
  const { data, error } = await supabase
    .from('my_conversations')
    .select('*')
    .order('last_message_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as InboxRow[];
}

export async function getUnreadTotal(): Promise<number> {
  const { data, error } = await supabase.from('my_conversations').select('unread_count').gt('unread_count', 0);
  if (error) throw error;
  return ((data ?? []) as { unread_count: number }[]).reduce((sum, row) => sum + row.unread_count, 0);
}

export type ConversationDetail = Conversation & {
  listing: (Pick<Listing, 'id' | 'title' | 'price' | 'status' | 'photos' | 'game_id' | 'seller_id'> & {
    card: { image_small: string | null } | null;
    item: { image_url: string | null } | null;
  }) | null;
  buyer: MemberSummary | null;
  seller: MemberSummary | null;
};

export async function getConversation(id: string): Promise<ConversationDetail | null> {
  const { data, error } = await supabase
    .from('conversations')
    .select(`
      *,
      listing:listings ( id, title, price, status, photos, game_id, seller_id, card:cards ( image_small ), item:catalog_items ( image_url ) ),
      buyer:profiles!conversations_buyer_id_fkey ( ${MEMBER_FIELDS} ),
      seller:profiles!conversations_seller_id_fkey ( ${MEMBER_FIELDS} )
    `)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as ConversationDetail | null) ?? null;
}

export async function getMessages(conversationId: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(500);
  if (error) throw error;
  return (data ?? []) as Message[];
}

export async function sendMessage(conversationId: string, body: string): Promise<void> {
  const me = await currentUserId();
  const { error } = await supabase
    .from('messages')
    .insert({ conversation_id: conversationId, sender_id: me, kind: 'text', body: body.trim() });
  if (error) throw error;
}

export async function sendOffer(conversationId: string, amount: number, note: string): Promise<void> {
  const me = await currentUserId();
  const { error } = await supabase.from('messages').insert({
    conversation_id: conversationId,
    sender_id: me,
    kind: 'offer',
    offer_amount: amount,
    body: note.trim() || null,
  });
  if (error) throw error;
}

export async function answerOffer(messageId: string, status: Exclude<OfferStatus, 'pending'>): Promise<void> {
  const { error } = await supabase.from('messages').update({ offer_status: status }).eq('id', messageId);
  if (error) throw error;
}

export async function markConversationRead(conversationId: string): Promise<void> {
  await supabase.rpc('mark_conversation_read', { p_conversation_id: conversationId });
}

/** Calls `onChange` when messages in the chat arrive or change. Returns a cleanup function. */
export function subscribeToConversation(conversationId: string, onChange: () => void): () => void {
  const channel = supabase
    .channel(`conversation:${conversationId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
      () => onChange(),
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

/** Calls `onChange` when any of the member's chats get new activity. */
export function subscribeToInbox(onChange: () => void): () => void {
  const channel = supabase
    .channel(`inbox:${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, () => onChange())
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

// ---------------------------------------------------------------------------
// Members, vouches, blocks, reports
// ---------------------------------------------------------------------------

export async function getMember(id: string): Promise<{ member: MemberSummary | null; stats: MemberStats | null }> {
  const [member, stats] = await Promise.all([
    supabase.from('profiles').select(MEMBER_FIELDS).eq('id', id).maybeSingle(),
    supabase.from('member_stats').select('*').eq('id', id).maybeSingle(),
  ]);
  if (member.error) throw member.error;
  if (stats.error) throw stats.error;
  return {
    member: (member.data as MemberSummary | null) ?? null,
    stats: (stats.data as MemberStats | null) ?? null,
  };
}

export async function getVouchesFor(memberId: string): Promise<Vouch[]> {
  const { data, error } = await supabase
    .from('vouches')
    .select('*, author:profiles!vouches_author_id_fkey ( id, display_name, username, avatar_url )')
    .eq('subject_id', memberId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as unknown as Vouch[];
}

export async function getMyVouch(listingId: string): Promise<Vouch | null> {
  const me = await currentUserId();
  const { data, error } = await supabase
    .from('vouches')
    .select('*')
    .eq('listing_id', listingId)
    .eq('author_id', me)
    .maybeSingle();
  if (error) throw error;
  return (data as Vouch | null) ?? null;
}

export async function leaveVouch(listingId: string, subjectId: string, rating: number, comment: string): Promise<void> {
  const { error } = await supabase
    .from('vouches')
    .insert({ listing_id: listingId, subject_id: subjectId, rating, comment: comment.trim() || null });
  if (error) throw error;
}

export async function getMyBlocks(): Promise<MemberSummary[]> {
  const { data, error } = await supabase
    .from('blocks')
    .select(`blocked:profiles!blocks_blocked_id_fkey ( ${MEMBER_FIELDS} )`)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as { blocked: MemberSummary | null }[])
    .map((row) => row.blocked)
    .filter((member): member is MemberSummary => member !== null);
}

export async function haveIBlocked(memberId: string): Promise<boolean> {
  const { data, error } = await supabase.from('blocks').select('blocked_id').eq('blocked_id', memberId).maybeSingle();
  if (error) throw error;
  return data !== null;
}

export async function blockMember(memberId: string): Promise<void> {
  const { error } = await supabase.from('blocks').insert({ blocked_id: memberId });
  if (error && error.code !== '23505') throw error; // already blocked is fine
}

export async function unblockMember(memberId: string): Promise<void> {
  const { error } = await supabase.from('blocks').delete().eq('blocked_id', memberId);
  if (error) throw error;
}

/** Turns the HunterX bot's Discord DMs on or off for the signed-in member. */
export async function setDiscordDms(enabled: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_discord_dms', { p_enabled: enabled });
  if (error) throw error;
}

export const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: 'scam', label: 'Scam or fraud' },
  { value: 'fake', label: 'Fake or counterfeit item' },
  { value: 'prohibited', label: 'Not allowed on HunterX' },
  { value: 'harassment', label: 'Harassment or abuse' },
  { value: 'spam', label: 'Spam' },
  { value: 'other', label: 'Something else' },
];

export async function fileReport(input: {
  listingId?: string;
  userId?: string;
  messageId?: string;
  reason: ReportReason;
  details: string;
}): Promise<void> {
  const { error } = await supabase.from('reports').insert({
    listing_id: input.listingId ?? null,
    reported_user_id: input.userId ?? null,
    message_id: input.messageId ?? null,
    reason: input.reason,
    details: input.details.trim() || null,
  });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Mods
// ---------------------------------------------------------------------------

export async function getReports(status: 'open' | 'closed'): Promise<Report[]> {
  let query = supabase
    .from('reports')
    .select(`
      *,
      reporter:profiles!reports_reporter_id_fkey ( id, display_name, username ),
      reported:profiles!reports_reported_user_id_fkey ( id, display_name, username ),
      listing:listings ( id, title, status, hidden_at )
    `)
    .order('created_at', { ascending: false })
    .limit(100);
  query = status === 'open' ? query.eq('status', 'open') : query.neq('status', 'open');
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as Report[];
}

export async function setReportStatus(id: string, status: 'open' | 'resolved' | 'dismissed'): Promise<void> {
  const { error } = await supabase.from('reports').update({ status }).eq('id', id);
  if (error) throw error;
}

export async function setListingHidden(id: string, hidden: boolean): Promise<void> {
  const { error } = await supabase
    .from('listings')
    .update({ hidden_at: hidden ? new Date().toISOString() : null })
    .eq('id', id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Account deletion
// ---------------------------------------------------------------------------

/** Removes the member's photos, then their account and everything tied to it. */
export async function deleteMyAccount(): Promise<void> {
  const me = await currentUserId();
  const bucket = supabase.storage.from(PHOTO_BUCKET);
  for (let round = 0; round < 20; round += 1) {
    const { data, error } = await bucket.list(me, { limit: 100 });
    if (error) throw error;
    const files = (data ?? []).filter((entry) => entry.id !== null).map((entry) => `${me}/${entry.name}`);
    if (files.length === 0) break;
    const removed = await bucket.remove(files);
    if (removed.error) throw removed.error;
  }
  const { error } = await supabase.rpc('delete_my_account');
  if (error) throw error;
  await supabase.auth.signOut();
}
