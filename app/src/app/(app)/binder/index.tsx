import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { CardArt } from '@/components/CardArt';
import { ChipRow } from '@/components/Chip';
import { Icon } from '@/components/Icon';
import { Sheet } from '@/components/Sheet';
import { PriceLine } from '@/components/Prices';
import { Notice, ProgressBar, Screen, SectionHeader, Stepper, Surface } from '@/components/ui';
import { getGames, getOtherCollectibles, getSetProgress, removeFromCollection, setQuantity } from '@/lib/data';
import { peso, percent } from '@/lib/format';
import { getCatalogPrices, getCollectionValue, type CatalogPrice } from '@/lib/prices';
import { errorMessage } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import type { CollectionItemWithRefs } from '@/lib/types';
import { useQuery } from '@/lib/useQuery';

export default function BinderScreen() {
  const games = useQuery(getGames, []);
  const progress = useQuery(getSetProgress, []);
  const others = useQuery(getOtherCollectibles, []);
  const value = useQuery(getCollectionValue, []);
  const [gameFilter, setGameFilter] = useState('all');
  const [openItemId, setOpenItemId] = useState<string | null>(null);
  const otherIds = (others.data ?? []).map((entry) => entry.catalog_item_id ?? '').join(',');
  const otherPrices = useQuery(() => getCatalogPrices(otherIds.split(',')), [otherIds]);
  const openItem = others.data?.find((entry) => entry.id === openItemId) ?? null;

  const gameOptions = useMemo(() => {
    const tcgs = (games.data ?? []).filter((game) => game.kind === 'tcg');
    return [{ value: 'all', label: 'All' }, ...tcgs.map((game) => ({ value: game.id, label: game.name }))];
  }, [games.data]);

  const sets = (progress.data ?? []).filter((set) => gameFilter === 'all' || set.game_id === gameFilter);
  const totalOwned = (progress.data ?? []).reduce((sum, set) => sum + set.owned_cards, 0);
  const nothingYet = progress.data?.length === 0 && others.data?.length === 0;

  return (
    <Screen>
      <View style={styles.titleRow}>
        <AppText variant="displaySmall" accessibilityRole="header">
          MY BINDER
        </AppText>
        <Button label="Add" icon="plus" onPress={() => router.push('/add')} />
      </View>

      {value.data && value.data.raw_cards + value.data.items > 0 ? (
        <Surface style={{ gap: 4 }}>
          <AppText variant="eyebrow">Worth about</AppText>
          <AppText variant="display">{peso(value.data.value_php)}</AppText>
          <AppText variant="small">
            {value.data.priced_cards + value.data.priced_items} of {value.data.raw_cards + value.data.items} raw cards,
            sealed products and toys priced. Uses the HunterX price, or the global price when something hasn’t sold here
            yet. Graded slabs aren’t counted yet.
          </AppText>
          <Pressable accessibilityRole="link" onPress={() => router.push('/prices')} style={{ alignSelf: 'flex-start', minHeight: 32, justifyContent: 'center' }}>
            <AppText variant="smallStrong" color={colors.accent}>
              Open the price guide
            </AppText>
          </Pressable>
        </Surface>
      ) : null}

      <Surface style={styles.summary}>
        <SummaryStat value={totalOwned} label="Different cards" />
        <SummaryStat value={progress.data?.length ?? 0} label="Sets tracked" divider />
        <SummaryStat value={others.data?.length ?? 0} label="Toys & sealed" divider />
      </Surface>

      {progress.error ? <Notice tone="error">{progress.error}</Notice> : null}

      {nothingYet ? (
        <Surface style={{ gap: 12 }}>
          <AppText variant="heading">Your binder is empty</AppText>
          <AppText variant="body" color={colors.textMuted}>
            Add a card by name or number and its set shows up here, with every card you're still
            missing.
          </AppText>
          <Button label="Add your first card" icon="plus" onPress={() => router.push('/add')} />
        </Surface>
      ) : null}

      {progress.data && progress.data.length > 0 ? (
        <View style={styles.section}>
          <SectionHeader title="Set progress" />
          <ChipRow
            accessibilityLabel="Filter sets by game"
            options={gameOptions}
            value={gameFilter}
            onChange={setGameFilter}
            scroll
          />
          {sets.length === 0 ? (
            <AppText variant="small">No sets for this game yet.</AppText>
          ) : (
            <Surface style={styles.listSurface}>
              {sets.map((set, index) => {
                const pct = percent(set.owned_cards, set.total_cards);
                const missing = Math.max(0, set.total_cards - set.owned_cards);
                return (
                  <Pressable
                    key={set.set_id}
                    accessibilityRole="link"
                    accessibilityLabel={`${set.name}, ${set.owned_cards} of ${set.total_cards} cards, ${missing} missing`}
                    onPress={() => router.push({ pathname: '/binder/[setId]', params: { setId: set.set_id } })}
                    style={({ pressed }) => [
                      styles.setRow,
                      index > 0 ? styles.rowDivider : null,
                      pressed ? { backgroundColor: colors.surface2 } : null,
                    ]}
                  >
                    <View style={styles.setRowTop}>
                      <AppText variant="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>
                        {set.name}
                      </AppText>
                      <AppText variant="label" color={colors.textMuted}>
                        {set.owned_cards}/{set.total_cards}
                      </AppText>
                    </View>
                    <ProgressBar percent={pct} />
                    <View style={styles.setRowTop}>
                      <AppText variant="small" style={{ flex: 1 }}>
                        {pct}% complete{set.copies > set.owned_cards ? ` · ${set.copies} copies` : ''}
                      </AppText>
                      <AppText variant="small">{missing} missing</AppText>
                    </View>
                  </Pressable>
                );
              })}
            </Surface>
          )}
        </View>
      ) : null}

      {others.data && others.data.length > 0 ? (
        <View style={styles.section}>
          <SectionHeader title="Toys & sealed" action={{ label: 'Add more', onPress: () => router.push('/add?tab=other') }} />
          <Surface style={styles.listSurface}>
            {others.data.map((entry, index) => (
              <Pressable
                key={entry.id}
                accessibilityRole="button"
                accessibilityHint="Change the quantity, sell or remove"
                onPress={() => setOpenItemId(entry.id)}
                style={({ pressed }) => [styles.otherRow, index > 0 ? styles.rowDivider : null, pressed ? styles.pressed : null]}
              >
                <CardArt gameId={entry.item?.game_id} imageUrl={entry.item?.image_url} width={44} height={56} />
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText variant="bodyStrong" numberOfLines={1}>
                    {entry.item?.name ?? 'Item'}
                  </AppText>
                  <AppText variant="small" numberOfLines={1}>
                    {itemDetails(entry)}
                  </AppText>
                </View>
                <View style={styles.rowRight}>
                  {otherPrices.data?.get(entry.catalog_item_id ?? '')?.value_php ? (
                    <AppText variant="smallStrong">{peso(otherPrices.data.get(entry.catalog_item_id ?? '')!.value_php!)}</AppText>
                  ) : null}
                  <AppText variant="label" color={colors.textMuted}>
                    ×{entry.quantity}
                  </AppText>
                </View>
                <Icon name="chevronRight" size={18} color={colors.textFaint} strokeWidth={2} />
              </Pressable>
            ))}
          </Surface>
        </View>
      ) : null}

      <ItemSheet
        entry={openItem}
        price={openItem ? otherPrices.data?.get(openItem.catalog_item_id ?? '') ?? null : null}
        onClose={() => setOpenItemId(null)}
        onChanged={others.reload}
        onRemoved={() => {
          setOpenItemId(null);
          others.reload();
        }}
      />
    </Screen>
  );
}

const itemDetails = (entry: CollectionItemWithRefs) =>
  [entry.kind === 'sealed' ? 'Sealed' : 'Toy', entry.item?.brand, entry.item?.line].filter(Boolean).join(' · ');

/** A toy or sealed item in the binder: how many, sell it, or remove it. */
function ItemSheet({
  entry,
  price,
  onClose,
  onChanged,
  onRemoved,
}: {
  entry: CollectionItemWithRefs | null;
  price: CatalogPrice | null;
  onClose: () => void;
  onChanged: () => void;
  onRemoved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const entryId = entry?.id ?? null;

  useEffect(() => {
    setConfirming(false);
    setError(null);
  }, [entryId]);

  async function run(action: () => Promise<void>, after: () => void) {
    setBusy(true);
    setError(null);
    try {
      await action();
      after();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  const name = entry?.item?.name ?? 'Item';
  return (
    <Sheet visible={entry !== null} title={name} onClose={onClose}>
      {entry ? (
        <>
          <View style={styles.sheetTop}>
            <CardArt gameId={entry.item?.game_id} imageUrl={entry.item?.image_url} width={64} height={82} />
            <View style={{ flex: 1, gap: 4 }}>
              <AppText variant="small">{itemDetails(entry)}</AppText>
              <PriceLine price={price} />
              {price?.value_php && entry.quantity > 1 ? (
                <AppText variant="smallStrong">
                  {entry.quantity} × {peso(price.value_php)} = {peso(entry.quantity * price.value_php)}
                </AppText>
              ) : null}
            </View>
          </View>

          <View style={styles.quantityRow}>
            <AppText variant="bodyStrong" style={{ flex: 1 }}>
              How many you have
            </AppText>
            <Stepper
              label="quantity"
              value={entry.quantity}
              onChange={(next) => run(() => setQuantity(entry.id, next), onChanged)}
            />
          </View>

          {error ? <Notice tone="error">{error}</Notice> : null}

          {entry.item ? (
            <Button
              label="Sell this"
              variant="outline"
              icon="tag"
              onPress={() => {
                const itemId = entry.item!.id;
                onClose();
                router.push({ pathname: '/market/new', params: { itemId } });
              }}
            />
          ) : null}

          {confirming ? (
            <View style={styles.confirm}>
              <AppText variant="body">Remove {name} from your binder?</AppText>
              <View style={styles.confirmButtons}>
                <Button
                  label="Remove"
                  variant="danger"
                  icon="trash"
                  loading={busy}
                  onPress={() => run(() => removeFromCollection(entry.id), onRemoved)}
                />
                <Button label="Keep it" variant="outline" disabled={busy} onPress={() => setConfirming(false)} />
              </View>
            </View>
          ) : (
            <Button label="Remove from binder" variant="danger" icon="trash" disabled={busy} onPress={() => setConfirming(true)} />
          )}
        </>
      ) : null}
    </Sheet>
  );
}

function SummaryStat({ value, label, divider = false }: { value: number; label: string; divider?: boolean }) {
  return (
    <View style={[styles.summaryStat, divider ? styles.summaryDivider : null]}>
      <AppText variant="displaySmall" style={{ fontSize: 24, lineHeight: 30 }}>
        {value.toLocaleString('en-US')}
      </AppText>
      <AppText variant="small">{label}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  summary: { flexDirection: 'row', paddingVertical: 16 },
  summaryStat: { flex: 1, gap: 2 },
  summaryDivider: { borderLeftWidth: 1, borderLeftColor: colors.border, paddingLeft: 14 },
  section: { gap: 12 },
  listSurface: { padding: 0, overflow: 'hidden' },
  setRow: { paddingHorizontal: 16, paddingVertical: 14, gap: 8 },
  rowDivider: { borderTopWidth: 1, borderTopColor: colors.surface3 },
  setRowTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  otherRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  pressed: { backgroundColor: colors.surface2 },
  rowRight: { alignItems: 'flex-end', gap: 2 },
  sheetTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  quantityRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  confirm: { gap: 12 },
  confirmButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
});
