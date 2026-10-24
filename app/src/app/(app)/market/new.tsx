import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { CardArt } from '@/components/CardArt';
import { Chip, ChipRow } from '@/components/Chip';
import { Icon } from '@/components/Icon';
import { PriceLine } from '@/components/Prices';
import { Notice, Screen, Stepper, Surface, TextField } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { getCard, getCatalogItem, getGames, searchCards, searchCatalog } from '@/lib/data';
import { conditionLabels, parsePeso } from '@/lib/format';
import {
  MAX_PHOTOS,
  PAYMENT_METHODS,
  createListing,
  deleteListingPhotos,
  getListing,
  photoUrl,
  updateListing,
  uploadListingPhoto,
} from '@/lib/market';
import { pickPhotos, type PickedPhoto } from '@/lib/photos';
import { getCardPrice } from '@/lib/prices';
import { discordInviteUrl, errorMessage } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import type { CardWithSet, CatalogItem, Condition, Grader, ListingKind, PaymentMethod } from '@/lib/types';
import { useQuery } from '@/lib/useQuery';

type Source = 'card' | 'catalog' | 'custom';
type Subject =
  | { source: 'card'; card: CardWithSet }
  | { source: 'catalog'; item: CatalogItem }
  | { source: 'custom'; gameId: string };

const CONDITIONS: Condition[] = ['NM', 'LP', 'MP', 'HP', 'DMG'];
const GRADERS: Grader[] = ['PSA', 'BGS', 'CGC', 'TAG', 'Other'];

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export default function NewListingScreen() {
  const params = useLocalSearchParams<{ edit?: string; cardId?: string; itemId?: string; condition?: string }>();
  const editId = first(params.edit);
  const cardId = first(params.cardId);
  const itemId = first(params.itemId);
  const { profile } = useAuth();

  const existing = useQuery(() => (editId ? getListing(editId) : Promise.resolve(null)), [editId]);
  const prefillCard = useQuery(() => (cardId && !editId ? getCard(cardId) : Promise.resolve(null)), [cardId, editId]);
  const prefillItem = useQuery(() => (itemId && !editId ? getCatalogItem(itemId) : Promise.resolve(null)), [itemId, editId]);

  const [subject, setSubject] = useState<Subject | null>(null);

  useEffect(() => {
    if (prefillCard.data) setSubject({ source: 'card', card: prefillCard.data });
  }, [prefillCard.data]);
  useEffect(() => {
    if (prefillItem.data) setSubject({ source: 'catalog', item: prefillItem.data });
  }, [prefillItem.data]);

  if (profile && !profile.in_guild) {
    return (
      <Screen>
        <AppText variant="displaySmall" accessibilityRole="header">
          SELL
        </AppText>
        <Notice tone="discord">
          <AppText variant="bodyStrong">Selling is for HunterX Discord members</AppText>
          <AppText variant="small" color={colors.discordText}>
            So every seller is someone the mods know. Join the server, then sign out and back in here so the site
            sees your membership.
          </AppText>
          <Button label="Join the Discord" variant="discord" onPress={() => Linking.openURL(discordInviteUrl)} />
        </Notice>
      </Screen>
    );
  }

  const loading = existing.loading || prefillCard.loading || prefillItem.loading;
  if (editId && loading && !existing.data) {
    return (
      <Screen>
        <ActivityIndicator color={colors.accent} />
      </Screen>
    );
  }

  if (editId && existing.data) {
    return (
      <Screen>
        <ListingForm mode="edit" listingId={editId} initial={existing.data} subject={null} />
      </Screen>
    );
  }

  return (
    <Screen>
      <AppText variant="displaySmall" accessibilityRole="header">
        {subject ? 'NEW LISTING' : 'WHAT ARE YOU SELLING?'}
      </AppText>
      {subject ? (
        <ListingForm mode="create" subject={subject} onChangeSubject={() => setSubject(null)} conditionHint={first(params.condition)} />
      ) : loading && (cardId || itemId) ? (
        <ActivityIndicator color={colors.accent} />
      ) : (
        <SubjectPicker onPick={setSubject} />
      )}
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Step 1: choose a card, a catalog item, or something else
// ---------------------------------------------------------------------------

function SubjectPicker({ onPick }: { onPick: (subject: Subject) => void }) {
  const games = useQuery(getGames, []);
  const tcgs = useMemo(() => (games.data ?? []).filter((game) => game.kind === 'tcg'), [games.data]);
  const [source, setSource] = useState<Source>('card');
  const [gameId, setGameId] = useState('pokemon');
  const [catalogKind, setCatalogKind] = useState<'toy' | 'sealed'>('sealed');
  const [term, setTerm] = useState('');
  const debounced = useDebounced(term);

  const cards = useQuery(
    () => (source === 'card' ? searchCards(gameId, debounced) : Promise.resolve([])),
    [source, gameId, debounced],
  );
  const items = useQuery(
    () => (source === 'catalog' ? searchCatalog(catalogKind, debounced) : Promise.resolve([])),
    [source, catalogKind, debounced],
  );

  return (
    <View style={{ gap: 16 }}>
      <ChipRow<Source>
        accessibilityLabel="What are you selling?"
        options={[
          { value: 'card', label: 'A card' },
          { value: 'catalog', label: 'Sealed or toy' },
          { value: 'custom', label: 'Something else' },
        ]}
        value={source}
        onChange={(value) => {
          setSource(value);
          setTerm('');
        }}
      />

      {source === 'card' ? (
        <>
          <ChipRow
            accessibilityLabel="Game"
            options={tcgs.map((game) => ({ value: game.id, label: game.name }))}
            value={gameId}
            onChange={setGameId}
            scroll
          />
          <TextField label="Search by card name or number" placeholder="e.g. Charizard ex or 223/197" value={term} onChangeText={setTerm} autoCorrect={false} />
          {cards.loading && debounced.length > 1 ? <ActivityIndicator color={colors.accent} /> : null}
          <View style={{ gap: 2 }}>
            {(cards.data ?? []).map((card) => (
              <Pressable
                key={card.id}
                accessibilityRole="button"
                onPress={() => onPick({ source: 'card', card })}
                style={({ pressed }) => [styles.result, pressed ? { backgroundColor: colors.surface2 } : null]}
              >
                <CardArt gameId={card.game_id} imageUrl={card.image_small} width={44} />
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText variant="bodyStrong" numberOfLines={1}>{card.name}</AppText>
                  <AppText variant="small" numberOfLines={1}>
                    {[card.set?.name, `#${card.number}`, card.rarity].filter(Boolean).join(' · ')}
                  </AppText>
                </View>
                <AppText variant="smallStrong" color={colors.accent}>Sell this</AppText>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}

      {source === 'catalog' ? (
        <>
          <ChipRow<'toy' | 'sealed'>
            accessibilityLabel="Kind"
            options={[
              { value: 'sealed', label: 'Sealed product' },
              { value: 'toy', label: 'Toy or figure' },
            ]}
            value={catalogKind}
            onChange={setCatalogKind}
          />
          <TextField
            label={catalogKind === 'sealed' ? 'Search sealed products' : 'Search toys and figures'}
            placeholder={catalogKind === 'sealed' ? 'e.g. Surging Sparks booster box' : 'e.g. Porsche 930'}
            value={term}
            onChangeText={setTerm}
          />
          <View style={{ gap: 2 }}>
            {(items.data ?? []).map((item) => (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                onPress={() => onPick({ source: 'catalog', item })}
                style={({ pressed }) => [styles.result, pressed ? { backgroundColor: colors.surface2 } : null]}
              >
                <CardArt gameId={item.game_id} imageUrl={item.image_url} width={44} height={56} />
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText variant="bodyStrong" numberOfLines={1}>{item.name}</AppText>
                  <AppText variant="small" numberOfLines={1}>{[item.brand, item.line].filter(Boolean).join(' · ')}</AppText>
                </View>
                <AppText variant="smallStrong" color={colors.accent}>Sell this</AppText>
              </Pressable>
            ))}
          </View>
          <AppText variant="small">
            Not in the list? Add it from Add to binder → Toys & sealed, or choose “Something else”.
          </AppText>
        </>
      ) : null}

      {source === 'custom' ? (
        <Surface style={{ gap: 12 }}>
          <AppText variant="body" color={colors.textMuted}>
            For bundles, lots, accessories or anything not in the card list. Pick the closest game.
          </AppText>
          <ChipRow
            accessibilityLabel="Game"
            options={(games.data ?? []).map((game) => ({ value: game.id, label: game.name }))}
            value={gameId}
            onChange={setGameId}
            scroll
          />
          <Button label="Continue" onPress={() => onPick({ source: 'custom', gameId })} />
        </Surface>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Step 2: the listing form (also used for editing)
// ---------------------------------------------------------------------------

type Existing = NonNullable<Awaited<ReturnType<typeof getListing>>>;

function ListingForm({
  mode,
  listingId,
  initial,
  subject,
  onChangeSubject,
  conditionHint,
}: {
  mode: 'create' | 'edit';
  listingId?: string;
  initial?: Existing;
  subject: Subject | null;
  onChangeSubject?: () => void;
  conditionHint?: string;
}) {
  const defaultKind: ListingKind = initial?.kind
    ?? (subject?.source === 'card' ? 'card' : subject?.source === 'catalog' ? (subject.item.kind === 'sealed' ? 'sealed' : 'item') : 'item');
  const defaultTitle = initial?.title
    ?? (subject?.source === 'card'
      ? `${subject.card.name}${subject.card.set ? ` · ${subject.card.set.name}` : ''} ${subject.card.number}`.slice(0, 120)
      : subject?.source === 'catalog'
        ? subject.item.name
        : '');

  const [title, setTitle] = useState(defaultTitle);
  const [kind, setKind] = useState<ListingKind>(defaultKind);
  const [condition, setCondition] = useState<Condition>(
    initial?.condition ?? (CONDITIONS.includes(conditionHint as Condition) ? (conditionHint as Condition) : 'NM'),
  );
  const [grader, setGrader] = useState<Grader>(initial?.grader ?? 'PSA');
  const [grade, setGrade] = useState(initial?.grade ? String(initial.grade) : '10');
  const [price, setPrice] = useState(initial ? String(initial.price) : '');
  const [quantity, setQuantity] = useState(initial?.quantity ?? 1);
  const [keptPhotos, setKeptPhotos] = useState<string[]>(initial?.photos ?? []);
  const [newPhotos, setNewPhotos] = useState<PickedPhoto[]>([]);
  const [meetup, setMeetup] = useState(initial?.meetup ?? true);
  const [meetupArea, setMeetupArea] = useState(initial?.meetup_area ?? '');
  const [shipping, setShipping] = useState(initial?.shipping ?? true);
  const [payments, setPayments] = useState<PaymentMethod[]>(initial?.payment_methods ?? ['GCash']);
  const [description, setDescription] = useState(initial?.description ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const priceCardId = initial ? initial.card_id : subject?.source === 'card' ? subject.card.id : null;
  const priceGuide = useQuery(() => (priceCardId ? getCardPrice(priceCardId) : Promise.resolve(null)), [priceCardId]);

  const isCard = initial ? !!initial.card_id : subject?.source === 'card';
  const priceValue = parsePeso(price);
  const gradeValue = Number(grade);
  const photoCount = keptPhotos.length + newPhotos.length;
  const problems = [
    title.trim().length < 3 ? 'Add a title (at least 3 letters).' : null,
    !priceValue ? 'Add a price.' : null,
    !meetup && !shipping ? 'Choose meetup, shipping, or both.' : null,
    kind === 'graded' && !(gradeValue >= 1 && gradeValue <= 10) ? 'Enter a grade from 1 to 10.' : null,
  ].filter((problem): problem is string => problem !== null);

  const kindOptions: { value: ListingKind; label: string }[] = isCard
    ? [
        { value: 'card', label: 'Raw card' },
        { value: 'graded', label: 'Graded slab' },
      ]
    : [
        { value: 'sealed', label: 'Sealed' },
        { value: 'item', label: 'Toy or collectible' },
        { value: 'card', label: 'Cards (lot)' },
      ];

  async function addPhotos() {
    setError(null);
    try {
      const picked = await pickPhotos(MAX_PHOTOS - photoCount);
      setNewPhotos((current) => [...current, ...picked].slice(0, MAX_PHOTOS - keptPhotos.length));
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  async function save() {
    if (problems.length > 0 || !priceValue) return;
    setBusy(true);
    setError(null);
    const uploaded: string[] = [];
    try {
      for (const photo of newPhotos) uploaded.push(await uploadListingPhoto(photo.blob));
      const input = {
        gameId: initial?.game_id
          ?? (subject?.source === 'card' ? subject.card.game_id : subject?.source === 'catalog' ? subject.item.game_id : subject?.gameId ?? 'toys'),
        cardId: initial ? initial.card_id : subject?.source === 'card' ? subject.card.id : null,
        catalogItemId: initial ? initial.catalog_item_id : subject?.source === 'catalog' ? subject.item.id : null,
        title,
        description,
        kind,
        condition: kind === 'graded' ? null : condition,
        grader: kind === 'graded' ? grader : null,
        grade: kind === 'graded' ? gradeValue : null,
        price: priceValue,
        quantity,
        photos: [...keptPhotos, ...uploaded],
        meetup,
        meetupArea,
        shipping,
        paymentMethods: payments,
      };
      if (mode === 'edit' && listingId) {
        await updateListing(listingId, input);
        const removed = (initial?.photos ?? []).filter((path) => !keptPhotos.includes(path));
        await deleteListingPhotos(removed).catch(() => {});
        router.replace({ pathname: '/market/[id]', params: { id: listingId } });
      } else {
        const id = await createListing(input);
        router.replace({ pathname: '/market/[id]', params: { id } });
      }
    } catch (cause) {
      await deleteListingPhotos(uploaded).catch(() => {});
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  const subjectLine =
    subject?.source === 'card'
      ? [subject.card.set?.name, `#${subject.card.number}`, subject.card.rarity].filter(Boolean).join(' · ')
      : subject?.source === 'catalog'
        ? [subject.item.brand, subject.item.line].filter(Boolean).join(' · ')
        : null;

  return (
    <View style={{ gap: 20 }}>
      {mode === 'edit' ? (
        <AppText variant="displaySmall" accessibilityRole="header">
          EDIT LISTING
        </AppText>
      ) : null}

      {subject && subject.source !== 'custom' ? (
        <Surface style={styles.subject}>
          <CardArt
            gameId={subject.source === 'card' ? subject.card.game_id : subject.item.game_id}
            imageUrl={subject.source === 'card' ? subject.card.image_small : subject.item.image_url}
            width={56}
          />
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="bodyStrong">{subject.source === 'card' ? subject.card.name : subject.item.name}</AppText>
            {subjectLine ? <AppText variant="small">{subjectLine}</AppText> : null}
          </View>
          {onChangeSubject ? (
            <Pressable accessibilityRole="button" onPress={onChangeSubject} style={styles.change}>
              <AppText variant="smallStrong" color={colors.accent}>Change</AppText>
            </Pressable>
          ) : null}
        </Surface>
      ) : null}

      <View style={styles.field}>
        <AppText variant="label" color={colors.textSoft}>
          Photos ({photoCount}/{MAX_PHOTOS})
        </AppText>
        <AppText variant="small">
          Real photos sell faster and build trust. Show the front, the back and any flaws.
        </AppText>
        <View style={styles.photos}>
          {keptPhotos.map((path) => (
            <PhotoTile key={path} uri={photoUrl(path)} onRemove={() => setKeptPhotos((list) => list.filter((p) => p !== path))} />
          ))}
          {newPhotos.map((photo) => (
            <PhotoTile key={photo.previewUri} uri={photo.previewUri} onRemove={() => setNewPhotos((list) => list.filter((p) => p !== photo))} />
          ))}
          {photoCount < MAX_PHOTOS ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Add photos" onPress={addPhotos} style={styles.addPhoto}>
              <Icon name="camera" size={24} color={colors.textMuted} />
              <AppText variant="smallStrong" color={colors.textMuted}>Add</AppText>
            </Pressable>
          ) : null}
        </View>
      </View>

      <TextField label="Title" value={title} onChangeText={setTitle} maxLength={120} placeholder="e.g. Charizard ex SIR · Obsidian Flames 223" />

      <View style={styles.field}>
        <AppText variant="label" color={colors.textSoft}>Type</AppText>
        <ChipRow<ListingKind> accessibilityLabel="Type" options={kindOptions} value={kind} onChange={setKind} />
      </View>

      {kind === 'graded' ? (
        <View style={styles.field}>
          <AppText variant="label" color={colors.textSoft}>Grading company</AppText>
          <ChipRow<Grader> accessibilityLabel="Grading company" options={GRADERS.map((value) => ({ value, label: value }))} value={grader} onChange={setGrader} />
          <TextField label="Grade (1 to 10)" value={grade} onChangeText={setGrade} keyboardType="decimal-pad" style={{ maxWidth: 140 }} />
        </View>
      ) : (
        <View style={styles.field}>
          <AppText variant="label" color={colors.textSoft}>Condition · {conditionLabels[condition]}</AppText>
          <ChipRow<Condition> accessibilityLabel="Condition" options={CONDITIONS.map((value) => ({ value, label: value }))} value={condition} onChange={setCondition} />
        </View>
      )}

      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <TextField label="Price (₱)" placeholder="e.g. 1500" value={price} onChangeText={setPrice} keyboardType="decimal-pad" />
          {priceCardId && kind === 'card' ? <PriceLine price={priceGuide.data} /> : null}
        </View>
        <View style={styles.field}>
          <AppText variant="label" color={colors.textSoft}>Quantity</AppText>
          <Stepper label="quantity" value={quantity} onChange={setQuantity} />
        </View>
      </View>

      <View style={styles.field}>
        <AppText variant="label" color={colors.textSoft}>Delivery</AppText>
        <View style={styles.chips}>
          <Chip label="Meetup" selected={meetup} onPress={() => setMeetup(!meetup)} />
          <Chip label="Shipping" selected={shipping} onPress={() => setShipping(!shipping)} />
        </View>
        {meetup ? (
          <TextField label="Meetup area" placeholder="e.g. Cubao or SM North, weekends" value={meetupArea} onChangeText={setMeetupArea} maxLength={80} />
        ) : null}
      </View>

      <View style={styles.field}>
        <AppText variant="label" color={colors.textSoft}>Payment you accept</AppText>
        <View style={styles.chips}>
          {PAYMENT_METHODS.map((method) => {
            const selected = payments.includes(method);
            return (
              <Chip
                key={method}
                label={method}
                selected={selected}
                onPress={() => setPayments(selected ? payments.filter((m) => m !== method) : [...payments, method])}
              />
            );
          })}
        </View>
      </View>

      <TextField
        label="Description (optional)"
        placeholder="Condition notes, what's included, trade preferences…"
        value={description}
        onChangeText={setDescription}
        maxLength={2000}
        multiline
        style={{ minHeight: 110, paddingTop: 12, textAlignVertical: 'top' }}
      />

      {problems.length > 0 && (title || price) ? (
        <AppText variant="small" color={colors.textMuted}>{problems.join(' ')}</AppText>
      ) : null}
      {error ? <Notice tone="error">{error}</Notice> : null}

      <Button
        label={mode === 'edit' ? 'Save changes' : 'Post listing'}
        icon={mode === 'edit' ? 'check' : 'plus'}
        size="lg"
        loading={busy}
        disabled={problems.length > 0}
        onPress={save}
      />
      <AppText variant="small" color={colors.textFaint}>
        Listings must follow the HunterX Discord rules. No fakes, proxies sold as real, or prohibited items.
      </AppText>
    </View>
  );
}

function PhotoTile({ uri, onRemove }: { uri: string; onRemove: () => void }) {
  return (
    <View style={styles.photo}>
      <Image source={{ uri }} style={styles.photoImage} accessibilityIgnoresInvertColors />
      <Pressable accessibilityRole="button" accessibilityLabel="Remove photo" onPress={onRemove} style={styles.removePhoto}>
        <Icon name="close" size={14} color={colors.text} strokeWidth={2.4} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  result: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 12,
    minHeight: 44,
  },
  subject: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  change: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 6 },
  field: { gap: 8 },
  row: { flexDirection: 'row', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  photo: { width: 96, height: 96, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.surface2 },
  photoImage: { width: '100%', height: '100%' },
  removePhoto: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(14,14,16,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPhoto: {
    width: 96,
    height: 96,
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
});
