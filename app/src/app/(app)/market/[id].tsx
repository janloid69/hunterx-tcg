import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { CardArt } from '@/components/CardArt';
import { Icon } from '@/components/Icon';
import { PriceLine } from '@/components/Prices';
import { ReportSheet, SafetyTips } from '@/components/Safety';
import { ConfirmSheet, Sheet } from '@/components/Sheet';
import { RatingSummary, StarPicker } from '@/components/Stars';
import { Badge, Notice, Screen, Surface, TextField } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { conditionLabels, kindLabels, parsePeso, peso, timeAgo } from '@/lib/format';
import {
  findMyConversation,
  getListing,
  getListingBuyers,
  getMember,
  getMyVouch,
  leaveVouch,
  listingImage,
  markSold,
  photoUrl,
  sendOffer,
  setListingHidden,
  setListingStatus,
  startConversation,
} from '@/lib/market';
import { getCardPrice } from '@/lib/prices';
import { errorMessage } from '@/lib/supabase';
import { colors, fonts, wideBreakpoint } from '@/lib/theme';
import type { ListingWithRefs, MemberSummary } from '@/lib/types';
import { useQuery } from '@/lib/useQuery';

export default function ListingScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id ?? '';
  const { session, profile } = useAuth();
  const me = session?.user.id ?? '';
  const { width } = useWindowDimensions();
  const wide = width >= wideBreakpoint;

  const listing = useQuery(() => getListing(id), [id]);
  const sellerId = listing.data?.seller_id ?? '';
  const seller = useQuery(() => (sellerId ? getMember(sellerId) : Promise.resolve(null)), [sellerId]);
  const isSeller = listing.data?.seller_id === me;
  const isBuyer = listing.data?.buyer_id === me;
  const showVouch = listing.data?.status === 'sold' && (isSeller ? !!listing.data.buyer_id : isBuyer);
  const myVouch = useQuery(() => (showVouch ? getMyVouch(id) : Promise.resolve(null)), [showVouch, id]);
  const cardId = listing.data?.card_id ?? null;
  const cardPrice = useQuery(() => (cardId ? getCardPrice(cardId) : Promise.resolve(null)), [cardId]);
  // The seller card's sold count and vouches change along with the listing.
  const refresh = () => {
    listing.reload();
    seller.reload();
  };

  const [photoIndex, setPhotoIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<'offer' | 'sold' | 'remove' | 'report' | 'vouch' | null>(null);

  if (listing.loading && !listing.data) {
    return (
      <Screen>
        <ActivityIndicator color={colors.accent} />
      </Screen>
    );
  }
  if (!listing.data) {
    return (
      <Screen>
        <BackLink />
        <Surface style={{ gap: 12 }}>
          <AppText variant="heading">Listing not found</AppText>
          <AppText variant="body" color={colors.textMuted}>
            It may have been removed or hidden after reports.
          </AppText>
          <Button label="Back to Market" onPress={() => router.replace('/market')} />
        </Surface>
      </Screen>
    );
  }

  const item = listing.data;
  const photos = item.photos.map(photoUrl);
  const mainImage = photos[photoIndex] ?? listingImage(item);
  const galleryWidth = wide ? 440 : Math.min(width - 40, 520);
  const tall = photos.length === 0 && (item.kind === 'card' || item.kind === 'graded');
  const stats = seller.data?.stats ?? null;
  const sellerName = item.seller?.display_name ?? item.seller?.username ?? 'Member';

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function openChat() {
    await run(async () => {
      const convo = (await findMyConversation(item.id)) ?? (await startConversation(item.id));
      router.push({ pathname: '/messages/[id]', params: { id: convo } });
    });
  }

  const details: { label: string; value: string }[] = [
    { label: 'Type', value: kindLabels[item.kind] },
    ...(item.kind === 'graded' && item.grader
      ? [{ label: 'Grade', value: `${item.grader} ${item.grade}` }]
      : item.condition
        ? [{ label: 'Condition', value: conditionLabels[item.condition] }]
        : []),
    ...(item.card ? [{ label: 'Card', value: `${item.card.set?.name ?? ''} · #${item.card.number}` }] : []),
    ...(item.card?.rarity ? [{ label: 'Rarity', value: item.card.rarity }] : []),
    ...(item.item?.brand ? [{ label: 'Brand', value: [item.item.brand, item.item.line].filter(Boolean).join(' · ') }] : []),
    ...(item.quantity > 1 ? [{ label: 'Quantity', value: `${item.quantity} available` }] : []),
  ];

  return (
    <Screen>
      <BackLink />

      {item.hidden_at ? (
        <Notice tone="error">
          {isSeller
            ? 'This listing is hidden from the Market after member reports. A mod will review it.'
            : 'This listing is hidden after member reports.'}
        </Notice>
      ) : null}
      {error ? <Notice tone="error">{error}</Notice> : null}

      <View style={[styles.top, wide ? styles.topWide : null]}>
        <View style={{ gap: 10, width: galleryWidth, maxWidth: '100%' }}>
          {mainImage ? (
            <Image
              source={{ uri: mainImage }}
              resizeMode="contain"
              accessibilityLabel={`Photo of ${item.title}`}
              style={[styles.mainImage, { width: galleryWidth, height: Math.round(galleryWidth * (tall ? 1.4 : 1)) }]}
            />
          ) : (
            <CardArt gameId={item.game_id} width={galleryWidth} height={Math.round(galleryWidth * (tall ? 1.4 : 1))} />
          )}
          {photos.length > 1 ? (
            <View style={styles.thumbs}>
              {photos.map((uri, index) => (
                <Pressable
                  key={uri}
                  accessibilityRole="button"
                  accessibilityLabel={`Photo ${index + 1} of ${photos.length}`}
                  accessibilityState={{ selected: index === photoIndex }}
                  onPress={() => setPhotoIndex(index)}
                  style={[styles.thumb, index === photoIndex ? styles.thumbOn : null]}
                >
                  <Image source={{ uri }} style={styles.thumbImage} accessibilityIgnoresInvertColors />
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>

        <View style={styles.info}>
          <View style={styles.badges}>
            {item.status !== 'active' ? (
              <Badge label={item.status === 'reserved' ? 'Reserved' : item.status === 'sold' ? 'Sold' : 'Removed'} tone="muted" />
            ) : null}
            {item.kind === 'graded' && item.grader ? <Badge label={`${item.grader} ${item.grade}`} tone="muted" /> : null}
          </View>
          <AppText variant="title" accessibilityRole="header">
            {item.title}
          </AppText>
          <AppText variant="display">{peso(item.price)}</AppText>
          <AppText variant="small">Listed {timeAgo(item.created_at)}</AppText>
          {item.card_id && item.kind === 'card' ? (
            <Pressable
              accessibilityRole="link"
              accessibilityLabel="Open this card's price guide"
              onPress={() => router.push({ pathname: '/card/[id]', params: { id: item.card_id! } })}
              style={styles.priceCheck}
            >
              <Icon name="chart" size={18} color={colors.accent} />
              <View style={{ flex: 1 }}>
                <AppText variant="smallStrong">Price check</AppText>
                <PriceLine price={cardPrice.data} />
              </View>
              <Icon name="chevronRight" size={16} color={colors.textFaint} strokeWidth={2} />
            </Pressable>
          ) : null}

          {isSeller ? (
            <SellerActions
              listing={item}
              busy={busy}
              onEdit={() => router.push({ pathname: '/market/new', params: { edit: item.id } })}
              onReserve={() => run(async () => { await setListingStatus(item.id, item.status === 'reserved' ? 'active' : 'reserved'); refresh(); })}
              onSold={() => setSheet('sold')}
              onRemove={() => setSheet('remove')}
              onRelist={() => run(async () => { await setListingStatus(item.id, 'active'); refresh(); })}
            />
          ) : item.status === 'active' || item.status === 'reserved' ? (
            <View style={styles.buyActions}>
              <Button label="Message seller" icon="chat" size="lg" loading={busy} onPress={openChat} style={{ flexGrow: 1 }} />
              <Button label="Make offer" variant="outline" size="lg" onPress={() => setSheet('offer')} style={{ flexGrow: 1 }} />
            </View>
          ) : null}

          {showVouch && !myVouch.loading && !myVouch.data ? (
            <Notice tone="success">
              <AppText variant="bodyStrong">How did the deal go?</AppText>
              <AppText variant="small" color={colors.textSoft}>
                Leave a vouch for {isSeller ? 'the buyer' : sellerName}. It helps other members trade safely.
              </AppText>
              <Button label="Leave a vouch" icon="star" onPress={() => setSheet('vouch')} />
            </Notice>
          ) : null}
          {showVouch && myVouch.data ? (
            <AppText variant="small">You left a {myVouch.data.rating}-star vouch for this deal.</AppText>
          ) : null}

          {profile?.is_mod && !isSeller ? (
            <Button
              label={item.hidden_at ? 'Restore listing (mod)' : 'Hide listing (mod)'}
              variant="outline"
              icon="shield"
              onPress={() => run(async () => { await setListingHidden(item.id, !item.hidden_at); refresh(); })}
            />
          ) : null}
        </View>
      </View>

      <Pressable
        accessibilityRole="link"
        onPress={() => router.push({ pathname: '/u/[id]', params: { id: item.seller_id } })}
      >
        <Surface style={styles.sellerCard}>
          <Avatar uri={item.seller?.avatar_url} name={sellerName} seed={item.seller_id} size={48} />
          <View style={{ flex: 1, gap: 4 }}>
            <View style={styles.badges}>
              <AppText variant="bodyStrong">{sellerName}</AppText>
              {item.seller?.is_verified_seller ? <Badge label="Verified Seller" /> : null}
              {item.seller?.is_mod ? <Badge label="Mod" tone="mod" /> : null}
            </View>
            <RatingSummary rating={stats?.rating_avg ?? null} count={stats?.vouch_count ?? 0} />
            {stats ? (
              <AppText variant="small">
                {stats.sold_listings} sold · {stats.active_listings} for sale
              </AppText>
            ) : null}
          </View>
          <Icon name="chevronRight" size={20} color={colors.textFaint} strokeWidth={2} />
        </Surface>
      </Pressable>

      <Surface style={{ gap: 12 }}>
        <AppText variant="heading">Details</AppText>
        {details.map((row) => (
          <View key={row.label} style={styles.detailRow}>
            <AppText variant="small" style={{ width: 96 }}>
              {row.label}
            </AppText>
            <AppText variant="body" style={{ flex: 1 }}>
              {row.value}
            </AppText>
          </View>
        ))}
        {item.description ? (
          <AppText variant="body" color={colors.textSoft} style={{ marginTop: 4 }}>
            {item.description}
          </AppText>
        ) : null}
      </Surface>

      <Surface style={{ gap: 12 }}>
        <AppText variant="heading">Delivery and payment</AppText>
        {item.meetup ? (
          <InfoRow icon="pin" title="Meetup" body={item.meetup_area || 'Ask the seller where'} />
        ) : null}
        {item.shipping ? <InfoRow icon="truck" title="Ships nationwide" body="Agree on the courier and fee in chat" /> : null}
        <InfoRow
          icon="cash"
          title="Payment"
          body={item.payment_methods.length > 0 ? item.payment_methods.join(', ') : 'Ask the seller'}
        />
      </Surface>

      {!isSeller ? <SafetyTips compact /> : null}

      {!isSeller ? (
        <Pressable accessibilityRole="button" onPress={() => setSheet('report')} style={styles.reportLink}>
          <Icon name="flag" size={16} color={colors.textMuted} />
          <AppText variant="label" color={colors.textMuted}>
            Report this listing
          </AppText>
        </Pressable>
      ) : null}

      <OfferSheet
        visible={sheet === 'offer'}
        listing={item}
        onClose={() => setSheet(null)}
      />
      <MarkSoldSheet
        visible={sheet === 'sold'}
        listing={item}
        onClose={() => setSheet(null)}
        onDone={() => {
          setSheet(null);
          refresh();
        }}
      />
      <ConfirmSheet
        visible={sheet === 'remove'}
        title="Remove this listing?"
        message="It disappears from the Market. Chats about it stay in Messages, and you can relist it later."
        confirmLabel="Remove listing"
        danger
        busy={busy}
        onClose={() => setSheet(null)}
        onConfirm={() =>
          run(async () => {
            await setListingStatus(item.id, 'removed');
            setSheet(null);
            refresh();
          })
        }
      />
      <ReportSheet
        visible={sheet === 'report'}
        onClose={() => setSheet(null)}
        target={{ listingId: item.id, label: 'listing' }}
      />
      <VouchSheet
        visible={sheet === 'vouch'}
        listingId={item.id}
        subjectId={isSeller ? item.buyer_id ?? '' : item.seller_id}
        subjectLabel={isSeller ? 'the buyer' : sellerName}
        onClose={() => setSheet(null)}
        onDone={() => {
          setSheet(null);
          myVouch.reload();
          seller.reload();
        }}
      />
    </Screen>
  );
}

function BackLink() {
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/market'))}
      style={styles.back}
    >
      <Icon name="chevronLeft" size={22} color={colors.text} strokeWidth={2} />
      <AppText variant="bodyStrong">Back</AppText>
    </Pressable>
  );
}

function InfoRow({ icon, title, body }: { icon: 'pin' | 'truck' | 'cash'; title: string; body: string }) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIcon}>
        <Icon name={icon} size={20} color={colors.text} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="bodyStrong">{title}</AppText>
        <AppText variant="small">{body}</AppText>
      </View>
    </View>
  );
}

function SellerActions({
  listing,
  busy,
  onEdit,
  onReserve,
  onSold,
  onRemove,
  onRelist,
}: {
  listing: ListingWithRefs;
  busy: boolean;
  onEdit: () => void;
  onReserve: () => void;
  onSold: () => void;
  onRemove: () => void;
  onRelist: () => void;
}) {
  if (listing.status === 'removed') {
    return (
      <View style={styles.buyActions}>
        <Button label="Relist" icon="plus" loading={busy} onPress={onRelist} />
        <Button label="Edit" variant="outline" icon="edit" onPress={onEdit} />
      </View>
    );
  }
  if (listing.status === 'sold') {
    return (
      <AppText variant="small">
        Sold{listing.sold_price ? ` for ${peso(listing.sold_price)}` : ''}
        {listing.sold_at ? ` · ${timeAgo(listing.sold_at)}` : ''}
      </AppText>
    );
  }
  return (
    <View style={styles.sellerActions}>
      <Button label="Mark as sold" icon="check" onPress={onSold} style={{ flexGrow: 1 }} />
      <Button
        label={listing.status === 'reserved' ? 'Mark available' : 'Mark reserved'}
        variant="outline"
        loading={busy}
        onPress={onReserve}
        style={{ flexGrow: 1 }}
      />
      <Button label="Edit" variant="outline" icon="edit" onPress={onEdit} style={{ flexGrow: 1 }} />
      <Button label="Remove" variant="danger" icon="trash" onPress={onRemove} style={{ flexGrow: 1 }} />
    </View>
  );
}

function OfferSheet({ visible, listing, onClose }: { visible: boolean; listing: ListingWithRefs; onClose: () => void }) {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const value = parsePeso(amount);

  async function submit() {
    if (!value) return;
    setBusy(true);
    setError(null);
    try {
      const convo = (await findMyConversation(listing.id)) ?? (await startConversation(listing.id));
      await sendOffer(convo, value, note);
      onClose();
      router.push({ pathname: '/messages/[id]', params: { id: convo } });
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet visible={visible} title="Make an offer" onClose={onClose}>
      <AppText variant="body" color={colors.textMuted}>
        Asking price is {peso(listing.price)}. Your offer goes to the seller in a chat, where they can accept or
        decline it.
      </AppText>
      <TextField label="Your offer (₱)" placeholder="e.g. 1200" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
      <TextField label="Message (optional)" placeholder="e.g. Can meet in Cubao this weekend" value={note} onChangeText={setNote} maxLength={300} />
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Button label={value ? `Send offer of ${peso(value)}` : 'Send offer'} loading={busy} disabled={!value} onPress={submit} />
    </Sheet>
  );
}

function MarkSoldSheet({
  visible,
  listing,
  onClose,
  onDone,
}: {
  visible: boolean;
  listing: ListingWithRefs;
  onClose: () => void;
  onDone: () => void;
}) {
  const buyers = useQuery(() => (visible ? getListingBuyers(listing.id) : Promise.resolve([])), [visible, listing.id]);
  const [buyerId, setBuyerId] = useState<string | null>(null);
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await markSold(listing.id, buyerId, parsePeso(price) ?? listing.price);
      onDone();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  const options: (MemberSummary | null)[] = [...(buyers.data ?? []), null];

  return (
    <Sheet visible={visible} title="Mark as sold" onClose={onClose}>
      <AppText variant="body" color={colors.textMuted}>
        Who bought it? Choosing a member lets you vouch for each other.
      </AppText>
      <View style={{ gap: 8 }} accessibilityRole="radiogroup">
        {options.map((buyer) => {
          const value = buyer?.id ?? null;
          const selected = buyerId === value;
          return (
            <Pressable
              key={value ?? 'outside'}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              onPress={() => setBuyerId(value)}
              style={[styles.choice, selected ? styles.choiceOn : null]}
            >
              {buyer ? (
                <Avatar uri={buyer.avatar_url} name={buyer.display_name} seed={buyer.id} size={32} />
              ) : (
                <View style={styles.choiceIcon}>
                  <Icon name="user" size={18} color={colors.textMuted} />
                </View>
              )}
              <AppText variant="bodyStrong" style={{ flex: 1, fontFamily: selected ? fonts.bold : fonts.semibold }}>
                {buyer ? buyer.display_name ?? buyer.username ?? 'Member' : 'Someone else, not on HunterX'}
              </AppText>
              {selected ? <Icon name="check" size={18} color={colors.accent} strokeWidth={2.6} /> : null}
            </Pressable>
          );
        })}
      </View>
      <TextField
        label="Final price (₱)"
        placeholder={String(listing.price)}
        value={price}
        onChangeText={setPrice}
        keyboardType="decimal-pad"
      />
      <AppText variant="small">The final price (without names) goes into the HunterX peso price guide.</AppText>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Button label="Mark as sold" icon="check" loading={busy} onPress={submit} />
    </Sheet>
  );
}

function VouchSheet({
  visible,
  listingId,
  subjectId,
  subjectLabel,
  onClose,
  onDone,
}: {
  visible: boolean;
  listingId: string;
  subjectId: string;
  subjectLabel: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await leaveVouch(listingId, subjectId, rating, comment);
      onDone();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet visible={visible} title={`Vouch for ${subjectLabel}`} onClose={onClose}>
      <StarPicker value={rating} onChange={setRating} />
      <TextField
        label="Comment (optional)"
        placeholder="e.g. Fast reply, item exactly as described"
        value={comment}
        onChangeText={setComment}
        maxLength={500}
        multiline
        style={{ minHeight: 80, paddingTop: 12, textAlignVertical: 'top' }}
      />
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Button label="Post vouch" icon="star" loading={busy} onPress={submit} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, alignSelf: 'flex-start' },
  priceCheck: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 4,
  },
  top: { gap: 20 },
  topWide: { flexDirection: 'row', alignItems: 'flex-start' },
  mainImage: { borderRadius: 16, backgroundColor: '#16161A' },
  thumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  thumb: { width: 60, height: 60, borderRadius: 10, borderWidth: 2, borderColor: 'transparent', overflow: 'hidden' },
  thumbOn: { borderColor: colors.accent },
  thumbImage: { width: '100%', height: '100%' },
  info: { flex: 1, gap: 10, minWidth: 0 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  buyActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 6 },
  sellerActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  sellerCard: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  detailRow: { flexDirection: 'row', gap: 12 },
  infoRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  infoIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportLink: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, alignSelf: 'center' },
  choice: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  choiceOn: { borderColor: colors.accent },
  choiceIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surface3,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
