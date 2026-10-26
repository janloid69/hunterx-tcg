import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { CardArt } from '@/components/CardArt';
import { ChipRow } from '@/components/Chip';
import { PriceLine } from '@/components/Prices';
import { Notice, Screen, Stepper, Surface, TextField } from '@/components/ui';
import {
  addToCollection,
  createCatalogItem,
  getGames,
  searchCards,
  searchCatalog,
} from '@/lib/data';
import { conditionLabels } from '@/lib/format';
import { getCatalogPrices } from '@/lib/prices';
import { errorMessage } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import type { CardWithSet, CatalogItem, Condition, Grader } from '@/lib/types';
import { useQuery } from '@/lib/useQuery';

type Tab = 'cards' | 'other';
type CardKind = 'card' | 'graded';
type OtherKind = 'toy' | 'sealed';

const CONDITIONS: Condition[] = ['NM', 'LP', 'MP', 'HP', 'DMG'];
const GRADERS: Grader[] = ['PSA', 'BGS', 'CGC', 'TAG', 'Other'];

/** Waits until typing pauses before searching. */
function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function parsePrice(text: string): number | null {
  const cleaned = text.replace(/[^\d.]/g, '');
  if (!cleaned) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

export default function AddScreen() {
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(params.tab === 'other' ? 'other' : 'cards');

  return (
    <Screen>
      <AppText variant="displaySmall" accessibilityRole="header">
        ADD TO BINDER
      </AppText>
      <ChipRow<Tab>
        accessibilityLabel="What are you adding?"
        options={[
          { value: 'cards', label: 'Cards' },
          { value: 'other', label: 'Toys & sealed' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'cards' ? <AddCard /> : <AddOther />}
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Cards from the card database
// ---------------------------------------------------------------------------

function AddCard() {
  const games = useQuery(getGames, []);
  const tcgs = useMemo(
    () => (games.data ?? []).filter((game) => game.kind === 'tcg'),
    [games.data],
  );
  const [gameId, setGameId] = useState('pokemon');
  const [term, setTerm] = useState('');
  const debounced = useDebounced(term);
  const results = useQuery(() => searchCards(gameId, debounced), [gameId, debounced]);
  const [picked, setPicked] = useState<CardWithSet | null>(null);

  useEffect(() => {
    if (tcgs.length > 0 && !tcgs.some((game) => game.id === gameId)) setGameId(tcgs[0].id);
  }, [tcgs, gameId]);

  if (picked) {
    return <CardForm card={picked} onDone={() => setPicked(null)} />;
  }

  return (
    <View style={styles.block}>
      <ChipRow
        accessibilityLabel="Game"
        options={tcgs.map((game) => ({ value: game.id, label: game.name }))}
        value={gameId}
        onChange={setGameId}
        scroll
      />
      <TextField
        label="Search by card name or number"
        placeholder="e.g. Pikachu ex or 238/191"
        value={term}
        onChangeText={setTerm}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
      />
      {results.error ? <Notice tone="error">{results.error}</Notice> : null}
      {results.loading && debounced.length > 1 ? <ActivityIndicator color={colors.accent} /> : null}
      {!results.loading && debounced.trim().length > 1 && (results.data ?? []).length === 0 ? (
        <AppText variant="small">
          No cards found. Try the number printed at the bottom of the card, or check the game.
        </AppText>
      ) : null}
      <View style={styles.results}>
        {(results.data ?? []).map((card) => (
          <Pressable
            key={card.id}
            accessibilityRole="button"
            accessibilityLabel={`${card.name}, ${card.set?.name ?? ''} number ${card.number}`}
            onPress={() => setPicked(card)}
            style={({ pressed }) => [styles.resultRow, pressed ? { backgroundColor: colors.surface2 } : null]}
          >
            <CardArt gameId={card.game_id} imageUrl={card.image_small} width={44} />
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="bodyStrong" numberOfLines={1}>
                {card.name}
              </AppText>
              <AppText variant="small" numberOfLines={1}>
                {[card.set?.name, `#${card.number}`, card.rarity].filter(Boolean).join(' · ')}
              </AppText>
            </View>
            <AppText variant="smallStrong" color={colors.accent}>
              Select
            </AppText>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function CardForm({ card, onDone }: { card: CardWithSet; onDone: () => void }) {
  const [kind, setKind] = useState<CardKind>('card');
  const [condition, setCondition] = useState<Condition>('NM');
  const [grader, setGrader] = useState<Grader>('PSA');
  const [grade, setGrade] = useState('10');
  const [quantity, setQuantityValue] = useState(1);
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const gradeValue = Number(grade);
  const gradeValid = kind === 'card' || (Number.isFinite(gradeValue) && gradeValue >= 1 && gradeValue <= 10);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await addToCollection({
        cardId: card.id,
        kind,
        quantity,
        condition,
        grader,
        grade: kind === 'graded' ? gradeValue : null,
        pricePaid: parsePrice(price),
      });
      setSaved(true);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  if (saved) {
    return (
      <Surface style={styles.block}>
        <Notice tone="success">{`Added ${card.name} to your binder.`}</Notice>
        <View style={styles.buttonRow}>
          <Button label="Add another card" icon="plus" onPress={onDone} />
          <Button
            label="View set"
            variant="outline"
            onPress={() => router.push({ pathname: '/binder/[setId]', params: { setId: card.set_id } })}
          />
        </View>
      </Surface>
    );
  }

  return (
    <Surface style={styles.block}>
      <View style={styles.pickedRow}>
        <CardArt gameId={card.game_id} imageUrl={card.image_small} width={72} />
        <View style={{ flex: 1, gap: 4 }}>
          <AppText variant="heading">{card.name}</AppText>
          <AppText variant="small">
            {[card.set?.name, `#${card.number}`, card.rarity].filter(Boolean).join(' · ')}
          </AppText>
          <Pressable accessibilityRole="button" onPress={onDone} style={styles.changeLink}>
            <AppText variant="smallStrong" color={colors.accent}>
              Pick a different card
            </AppText>
          </Pressable>
        </View>
      </View>

      <View style={styles.field}>
        <AppText variant="label" color={colors.textSoft}>
          Type
        </AppText>
        <ChipRow<CardKind>
          accessibilityLabel="Type"
          options={[
            { value: 'card', label: 'Raw card' },
            { value: 'graded', label: 'Graded slab' },
          ]}
          value={kind}
          onChange={setKind}
        />
      </View>

      {kind === 'card' ? (
        <View style={styles.field}>
          <AppText variant="label" color={colors.textSoft}>
            Condition · {conditionLabels[condition]}
          </AppText>
          <ChipRow<Condition>
            accessibilityLabel="Condition"
            options={CONDITIONS.map((value) => ({ value, label: value }))}
            value={condition}
            onChange={setCondition}
          />
        </View>
      ) : (
        <View style={styles.field}>
          <AppText variant="label" color={colors.textSoft}>
            Grading company
          </AppText>
          <ChipRow<Grader>
            accessibilityLabel="Grading company"
            options={GRADERS.map((value) => ({ value, label: value }))}
            value={grader}
            onChange={setGrader}
          />
          <TextField
            label="Grade (1 to 10)"
            value={grade}
            onChangeText={setGrade}
            keyboardType="decimal-pad"
            style={{ maxWidth: 120 }}
          />
          {gradeValid ? null : <AppText variant="small" color={colors.down}>Enter a grade from 1 to 10.</AppText>}
        </View>
      )}

      <View style={styles.inlineField}>
        <AppText variant="label" color={colors.textSoft}>
          Quantity
        </AppText>
        <Stepper label="quantity" value={quantity} onChange={setQuantityValue} />
      </View>

      <TextField
        label="Price paid per copy (₱, optional)"
        placeholder="e.g. 1500"
        value={price}
        onChangeText={setPrice}
        keyboardType="decimal-pad"
      />

      {error ? <Notice tone="error">{error}</Notice> : null}
      <Button label="Add to binder" icon="plus" size="lg" loading={busy} disabled={!gradeValid} onPress={save} />
    </Surface>
  );
}

// ---------------------------------------------------------------------------
// Toys and sealed products from the shared catalog
// ---------------------------------------------------------------------------

function AddOther() {
  const games = useQuery(getGames, []);
  const [kind, setKind] = useState<OtherKind>('toy');
  const [term, setTerm] = useState('');
  const debounced = useDebounced(term);
  const results = useQuery(() => searchCatalog(kind, debounced), [kind, debounced]);
  const resultIds = (results.data ?? []).map((item) => item.id).join(',');
  const resultPrices = useQuery(() => getCatalogPrices(resultIds.split(',')), [resultIds]);
  const [picked, setPicked] = useState<CatalogItem | null>(null);
  const [creating, setCreating] = useState(false);

  if (picked) {
    return <OtherForm item={picked} onDone={() => setPicked(null)} />;
  }
  if (creating) {
    return (
      <NewCatalogItem
        kind={kind}
        initialName={term}
        tcgs={(games.data ?? []).filter((game) => game.kind === 'tcg')}
        onCancel={() => setCreating(false)}
        onCreated={(item) => {
          setCreating(false);
          setPicked(item);
        }}
      />
    );
  }

  return (
    <View style={styles.block}>
      <ChipRow<OtherKind>
        accessibilityLabel="Kind"
        options={[
          { value: 'toy', label: 'Toy or figure' },
          { value: 'sealed', label: 'Sealed product' },
        ]}
        value={kind}
        onChange={setKind}
      />
      <TextField
        label={kind === 'toy' ? 'Search toys (Hot Wheels, Beyblade, figures…)' : 'Search sealed products'}
        placeholder={kind === 'toy' ? 'e.g. Porsche 930' : 'e.g. Surging Sparks booster box'}
        value={term}
        onChangeText={setTerm}
        autoCorrect={false}
      />
      {results.error ? <Notice tone="error">{results.error}</Notice> : null}
      <View style={styles.results}>
        {(results.data ?? []).map((item) => (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            onPress={() => setPicked(item)}
            style={({ pressed }) => [styles.resultRow, pressed ? { backgroundColor: colors.surface2 } : null]}
          >
            <CardArt gameId={item.game_id} imageUrl={item.image_url} width={44} height={56} />
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="bodyStrong" numberOfLines={1}>
                {item.name}
              </AppText>
              <AppText variant="small" numberOfLines={1}>
                {[item.brand, item.line, item.status === 'pending' ? 'Waiting for mod review' : null]
                  .filter(Boolean)
                  .join(' · ')}
              </AppText>
              {resultPrices.data?.get(item.id) ? <PriceLine price={resultPrices.data.get(item.id)} /> : null}
            </View>
            <AppText variant="smallStrong" color={colors.accent}>
              Select
            </AppText>
          </Pressable>
        ))}
      </View>
      <Surface style={{ gap: 10 }}>
        <AppText variant="body" color={colors.textMuted}>
          Can't find it? Add it to the shared catalog. A mod checks new entries before other members
          see them.
        </AppText>
        <Button label="Add a new item" variant="outline" icon="plus" onPress={() => setCreating(true)} />
      </Surface>
    </View>
  );
}

function NewCatalogItem({
  kind,
  initialName,
  tcgs,
  onCancel,
  onCreated,
}: {
  kind: OtherKind;
  initialName: string;
  tcgs: { id: string; name: string }[];
  onCancel: () => void;
  onCreated: (item: CatalogItem) => void;
}) {
  const [name, setName] = useState(initialName);
  const [brand, setBrand] = useState('');
  const [line, setLine] = useState('');
  const [gameId, setGameId] = useState(kind === 'toy' ? 'toys' : tcgs[0]?.id ?? 'pokemon');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = name.trim().length >= 2;

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const item = await createCatalogItem({ kind, gameId, name, brand, line });
      onCreated(item);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Surface style={styles.block}>
      <AppText variant="heading">{kind === 'toy' ? 'New toy or figure' : 'New sealed product'}</AppText>
      {kind === 'sealed' ? (
        <View style={styles.field}>
          <AppText variant="label" color={colors.textSoft}>
            Game
          </AppText>
          <ChipRow
            accessibilityLabel="Game"
            options={tcgs.map((game) => ({ value: game.id, label: game.name }))}
            value={gameId}
            onChange={setGameId}
            scroll
          />
        </View>
      ) : null}
      <TextField
        label="Name"
        placeholder={kind === 'toy' ? 'e.g. Porsche 930 Turbo' : 'e.g. Surging Sparks Booster Box'}
        value={name}
        onChangeText={setName}
        maxLength={120}
      />
      <TextField
        label={kind === 'toy' ? 'Brand (optional)' : 'Publisher (optional)'}
        placeholder={kind === 'toy' ? 'e.g. Hot Wheels' : 'e.g. The Pokémon Company'}
        value={brand}
        onChangeText={setBrand}
        maxLength={60}
      />
      <TextField
        label={kind === 'toy' ? 'Series or line (optional)' : 'Edition or language (optional)'}
        placeholder={kind === 'toy' ? 'e.g. Red Line Club' : 'e.g. English'}
        value={line}
        onChangeText={setLine}
        maxLength={80}
      />
      {error ? <Notice tone="error">{error}</Notice> : null}
      <View style={styles.buttonRow}>
        <Button label="Save and continue" loading={busy} disabled={!valid} onPress={create} />
        <Button label="Cancel" variant="ghost" onPress={onCancel} />
      </View>
    </Surface>
  );
}

function OtherForm({ item, onDone }: { item: CatalogItem; onDone: () => void }) {
  const [condition, setCondition] = useState<Condition>('NM');
  const [quantity, setQuantityValue] = useState(1);
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const conditionOptions: { value: Condition; label: string }[] =
    item.kind === 'sealed'
      ? [
          { value: 'NM', label: 'Sealed, mint' },
          { value: 'LP', label: 'Sealed, light wear' },
          { value: 'MP', label: 'Damaged box' },
        ]
      : [
          { value: 'NM', label: 'Mint in box' },
          { value: 'LP', label: 'Loose, like new' },
          { value: 'MP', label: 'Played with' },
          { value: 'HP', label: 'Damaged' },
        ];

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await addToCollection({
        catalogItemId: item.id,
        kind: item.kind === 'sealed' ? 'sealed' : 'item',
        quantity,
        condition,
        pricePaid: parsePrice(price),
      });
      setSaved(true);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  if (saved) {
    return (
      <Surface style={styles.block}>
        <Notice tone="success">{`Added ${item.name} to your binder.`}</Notice>
        <View style={styles.buttonRow}>
          <Button label="Add another" icon="plus" onPress={onDone} />
          <Button label="Open binder" variant="outline" onPress={() => router.push('/binder')} />
        </View>
      </Surface>
    );
  }

  return (
    <Surface style={styles.block}>
      <View style={styles.pickedRow}>
        <CardArt gameId={item.game_id} imageUrl={item.image_url} width={64} height={80} />
        <View style={{ flex: 1, gap: 4 }}>
          <AppText variant="heading">{item.name}</AppText>
          <AppText variant="small">{[item.brand, item.line].filter(Boolean).join(' · ')}</AppText>
          <Pressable accessibilityRole="button" onPress={onDone} style={styles.changeLink}>
            <AppText variant="smallStrong" color={colors.accent}>
              Pick something else
            </AppText>
          </Pressable>
        </View>
      </View>
      <View style={styles.field}>
        <AppText variant="label" color={colors.textSoft}>
          Condition
        </AppText>
        <ChipRow<Condition>
          accessibilityLabel="Condition"
          options={conditionOptions}
          value={condition}
          onChange={setCondition}
        />
      </View>
      <View style={styles.inlineField}>
        <AppText variant="label" color={colors.textSoft}>
          Quantity
        </AppText>
        <Stepper label="quantity" value={quantity} onChange={setQuantityValue} />
      </View>
      <TextField
        label="Price paid each (₱, optional)"
        placeholder="e.g. 6200"
        value={price}
        onChangeText={setPrice}
        keyboardType="decimal-pad"
      />
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Button label="Add to binder" icon="plus" size="lg" loading={busy} onPress={save} />
    </Surface>
  );
}

const styles = StyleSheet.create({
  block: { gap: 16 },
  results: { gap: 2 },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 12,
    minHeight: 44,
  },
  pickedRow: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  changeLink: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  field: { gap: 8 },
  inlineField: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  buttonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
});
