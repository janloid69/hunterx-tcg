import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { CardArt } from '@/components/CardArt';
import { ChipRow } from '@/components/Chip';
import { Icon } from '@/components/Icon';
import { Notice, ProgressBar, Stepper } from '@/components/ui';
import {
  addToCollection,
  getMyCopiesInSet,
  getSet,
  getSetCards,
  removeFromCollection,
  setQuantity,
} from '@/lib/data';
import { conditionLabels, percent } from '@/lib/format';
import { errorMessage } from '@/lib/supabase';
import { colors, maxContentWidth } from '@/lib/theme';
import type { Card, CollectionItem, Condition } from '@/lib/types';
import { useQuery } from '@/lib/useQuery';

type Filter = 'all' | 'missing' | 'owned';
const CONDITIONS: Condition[] = ['NM', 'LP', 'MP', 'HP', 'DMG'];

export default function SetScreen() {
  const { setId: rawSetId } = useLocalSearchParams<{ setId: string }>();
  const setId = Array.isArray(rawSetId) ? rawSetId[0] : rawSetId ?? '';
  const { width } = useWindowDimensions();

  const set = useQuery(() => getSet(setId), [setId]);
  const cards = useQuery(() => getSetCards(setId), [setId]);
  const copies = useQuery(() => getMyCopiesInSet(setId), [setId]);

  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<Card | null>(null);

  const copiesByCard = useMemo(() => {
    const map = new Map<string, CollectionItem[]>();
    for (const copy of copies.data ?? []) {
      if (!copy.card_id) continue;
      map.set(copy.card_id, [...(map.get(copy.card_id) ?? []), copy]);
    }
    return map;
  }, [copies.data]);

  const allCards = cards.data ?? [];
  const owned = allCards.filter((card) => copiesByCard.has(card.id)).length;
  const total = set.data?.card_count ?? allCards.length;
  const pct = percent(owned, total);

  const visible = allCards.filter((card) => {
    if (filter === 'missing') return !copiesByCard.has(card.id);
    if (filter === 'owned') return copiesByCard.has(card.id);
    return true;
  });

  const contentWidth = Math.min(width, maxContentWidth) - 40;
  const columns = Math.max(3, Math.min(8, Math.floor((contentWidth + 10) / 130)));
  const tileWidth = Math.floor((contentWidth - (columns - 1) * 10) / columns);

  const loading = set.loading || cards.loading || copies.loading;
  const error = set.error ?? cards.error ?? copies.error;

  return (
    <View style={styles.page}>
      <FlatList
        key={`cols-${columns}`}
        data={visible}
        numColumns={columns}
        keyExtractor={(card) => card.id}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        columnWrapperStyle={columns > 1 ? styles.gridRow : undefined}
        ListHeaderComponent={
          <View style={styles.header}>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel="Back to binder"
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/binder'))}
              style={styles.back}
            >
              <Icon name="chevronLeft" size={22} color={colors.text} strokeWidth={2} />
              <AppText variant="bodyStrong">Binder</AppText>
            </Pressable>

            <View style={{ gap: 4 }}>
              <AppText variant="displaySmall" accessibilityRole="header">
                {set.data?.name?.toUpperCase() ?? ' '}
              </AppText>
              <AppText variant="small">
                {[set.data?.series, set.data?.code].filter(Boolean).join(' · ')}
              </AppText>
            </View>

            <View style={styles.progressBlock}>
              <View style={styles.progressTop}>
                <AppText variant="bodyStrong">
                  {owned} of {total} cards
                </AppText>
                <AppText variant="label" color={colors.textMuted}>
                  {pct}% complete
                </AppText>
              </View>
              <ProgressBar percent={pct} />
            </View>

            <ChipRow<Filter>
              accessibilityLabel="Show cards"
              options={[
                { value: 'all', label: `All (${allCards.length})` },
                { value: 'missing', label: `Missing (${allCards.length - owned})` },
                { value: 'owned', label: `Owned (${owned})` },
              ]}
              value={filter}
              onChange={setFilter}
            />

            {error ? <Notice tone="error">{error}</Notice> : null}
            {loading && !cards.data ? <ActivityIndicator color={colors.accent} /> : null}
          </View>
        }
        ListEmptyComponent={
          loading ? undefined : (
            <AppText variant="small" style={{ paddingVertical: 12 }}>
              {filter === 'missing' ? 'Nothing missing. Set complete!' : 'No cards to show.'}
            </AppText>
          )
        }
        renderItem={({ item: card }) => {
          const mine = copiesByCard.get(card.id) ?? [];
          const count = mine.reduce((sum, copy) => sum + copy.quantity, 0);
          const have = count > 0;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${card.name}, number ${card.number}, ${have ? `you have ${count}` : 'missing'}`}
              onPress={() => setSelected(card)}
              style={({ pressed }) => [{ width: tileWidth, gap: 6 }, pressed ? { opacity: 0.8 } : null]}
            >
              {have ? (
                <View>
                  <CardArt gameId={card.game_id} imageUrl={card.image_small} width={tileWidth} />
                  {count > 1 ? (
                    <View style={styles.qtyBadge}>
                      <AppText variant="smallStrong" color={colors.onAccent} style={{ fontSize: 11 }}>
                        ×{count}
                      </AppText>
                    </View>
                  ) : null}
                </View>
              ) : (
                <View style={[styles.missingSlot, { width: tileWidth, height: Math.round((tileWidth * 7) / 5) }]}>
                  <Icon name="plus" size={20} color={colors.textFaint} strokeWidth={2} />
                  <AppText variant="smallStrong" color={colors.textFaint} numberOfLines={2} style={styles.missingName}>
                    {card.name}
                  </AppText>
                </View>
              )}
              <View style={styles.tileFooter}>
                <AppText variant="small" numberOfLines={1} style={{ flex: 1 }}>
                  #{card.number}
                </AppText>
                {have ? null : (
                  <AppText variant="smallStrong" color={colors.accent}>
                    Add
                  </AppText>
                )}
              </View>
            </Pressable>
          );
        }}
      />

      <CardSheet
        card={selected}
        copies={selected ? copiesByCard.get(selected.id) ?? [] : []}
        onClose={() => setSelected(null)}
        onChanged={copies.reload}
      />
    </View>
  );
}

function CardSheet({
  card,
  copies,
  onClose,
  onChanged,
}: {
  card: Card | null;
  copies: CollectionItem[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [condition, setCondition] = useState<Condition>('NM');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      onChanged();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={card !== null} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} accessibilityLabel="Close" onPress={onClose} />
      <View style={styles.sheet}>
        {card ? (
          <ScrollView contentContainerStyle={styles.sheetContent}>
            <View style={styles.sheetTop}>
              <CardArt gameId={card.game_id} imageUrl={card.image_small} width={84} />
              <View style={{ flex: 1, gap: 4 }}>
                <AppText variant="heading">{card.name}</AppText>
                <AppText variant="small">
                  #{card.number}
                  {card.rarity ? ` · ${card.rarity}` : ''}
                </AppText>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={styles.close}>
                <Icon name="close" size={20} color={colors.text} strokeWidth={2} />
              </Pressable>
            </View>

            {copies.length > 0 ? (
              <View style={{ gap: 10 }}>
                <AppText variant="eyebrow">In your binder</AppText>
                {copies.map((copy) => (
                  <View key={copy.id} style={styles.copyRow}>
                    <View style={{ flex: 1 }}>
                      <AppText variant="bodyStrong">
                        {copy.kind === 'graded' && copy.grader
                          ? `${copy.grader} ${copy.grade}`
                          : conditionLabels[copy.condition ?? 'NM']}
                      </AppText>
                    </View>
                    <Stepper
                      label="copies"
                      value={copy.quantity}
                      onChange={(next) => run(() => setQuantity(copy.id, next))}
                    />
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Remove from binder"
                      disabled={busy}
                      onPress={() => run(() => removeFromCollection(copy.id))}
                      style={styles.close}
                    >
                      <Icon name="close" size={18} color={colors.down} strokeWidth={2} />
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : null}

            <View style={{ gap: 10 }}>
              <AppText variant="eyebrow">Add a copy</AppText>
              <ChipRow<Condition>
                accessibilityLabel="Condition"
                options={CONDITIONS.map((value) => ({ value, label: value }))}
                value={condition}
                onChange={setCondition}
              />
              <AppText variant="small">{conditionLabels[condition]}</AppText>
              <Button
                label="Add to binder"
                icon="plus"
                loading={busy}
                onPress={() =>
                  run(() => addToCollection({ cardId: card.id, kind: 'card', quantity: 1, condition }))
                }
              />
              <AppText variant="small" color={colors.textFaint}>
                Graded slab or price paid? Use Add from the top bar.
              </AppText>
            </View>

            {error ? <Notice tone="error">{error}</Notice> : null}
          </ScrollView>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  list: { flex: 1 },
  listContent: {
    width: '100%',
    maxWidth: maxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingBottom: 40,
    gap: 14,
  },
  gridRow: { gap: 10 },
  header: { gap: 16, paddingTop: 8, paddingBottom: 4 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, alignSelf: 'flex-start' },
  progressBlock: { gap: 8 },
  progressTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  qtyBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: colors.accent,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  missingSlot: {
    borderRadius: 10,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: 8,
  },
  missingName: { textAlign: 'center', fontSize: 11 },
  tileFooter: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    maxHeight: '80%',
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    backgroundColor: '#16161A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sheetContent: { padding: 20, gap: 20 },
  sheetTop: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  copyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
