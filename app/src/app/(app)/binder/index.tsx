import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { CardArt } from '@/components/CardArt';
import { ChipRow } from '@/components/Chip';
import { Notice, ProgressBar, Screen, SectionHeader, Surface } from '@/components/ui';
import { getGames, getOtherCollectibles, getSetProgress } from '@/lib/data';
import { percent } from '@/lib/format';
import { colors } from '@/lib/theme';
import { useQuery } from '@/lib/useQuery';

export default function BinderScreen() {
  const games = useQuery(getGames, []);
  const progress = useQuery(getSetProgress, []);
  const others = useQuery(getOtherCollectibles, []);
  const [gameFilter, setGameFilter] = useState('all');

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
              <View key={entry.id} style={[styles.otherRow, index > 0 ? styles.rowDivider : null]}>
                <CardArt gameId={entry.item?.game_id} imageUrl={entry.item?.image_url} width={44} height={56} />
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText variant="bodyStrong" numberOfLines={1}>
                    {entry.item?.name ?? 'Item'}
                  </AppText>
                  <AppText variant="small" numberOfLines={1}>
                    {[entry.kind === 'sealed' ? 'Sealed' : 'Toy', entry.item?.brand, entry.item?.line]
                      .filter(Boolean)
                      .join(' · ')}
                  </AppText>
                </View>
                <AppText variant="label" color={colors.textMuted}>
                  ×{entry.quantity}
                </AppText>
              </View>
            ))}
          </Surface>
        </View>
      ) : null}
    </Screen>
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
});
