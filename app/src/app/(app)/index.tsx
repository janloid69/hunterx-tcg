import { router } from 'expo-router';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { CardArt } from '@/components/CardArt';
import { Icon, type IconName } from '@/components/Icon';
import { Badge, Notice, ProgressBar, Screen, SectionHeader, Surface } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { getCollectionSummary, getRecentItems, getSetProgress } from '@/lib/data';
import { greeting, percent, peso } from '@/lib/format';
import { discordInviteUrl } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { useQuery } from '@/lib/useQuery';

const QUICK_ACTIONS: { label: string; icon: IconName; href: '/add' | '/scan' | '/binder' | '/market' }[] = [
  { label: 'Add', icon: 'plus', href: '/add' },
  { label: 'Scan', icon: 'scan', href: '/scan' },
  { label: 'Binder', icon: 'binder', href: '/binder' },
  { label: 'Market', icon: 'market', href: '/market' },
];

export default function HomeScreen() {
  const { profile, roleSyncError } = useAuth();
  const summary = useQuery(getCollectionSummary, []);
  const recent = useQuery(() => getRecentItems(6), []);
  const progress = useQuery(getSetProgress, []);

  const name = profile?.display_name ?? profile?.username ?? 'Hunter';
  const isEmpty = summary.data !== undefined && summary.data.totalQuantity === 0;

  return (
    <Screen>
      <View style={styles.greeting}>
        <AppText variant="title" accessibilityRole="header">
          {greeting()}, {name}
        </AppText>
        <View style={styles.badges}>
          {profile?.is_verified_seller ? <Badge label="Verified Seller" /> : null}
          {profile?.is_mod ? <Badge label="Mod" tone="mod" /> : null}
        </View>
      </View>

      {roleSyncError ? (
        <Notice tone="error">{`We couldn't read your Discord roles: ${roleSyncError}`}</Notice>
      ) : null}

      {profile && !profile.in_guild ? (
        <Notice tone="discord">
          <AppText variant="bodyStrong">Join the HunterX Discord to sell</AppText>
          <AppText variant="small" color={colors.discordText}>
            Anyone can track a binder. Selling is for HunterX Discord members, so every seller is
            someone the mods know.
          </AppText>
          <Button label="Join the Discord" variant="discord" onPress={() => Linking.openURL(discordInviteUrl)} />
        </Notice>
      ) : null}

      <Surface style={styles.summary}>
        <AppText variant="eyebrow">Your collection</AppText>
        <AppText variant="display">
          {summary.data ? summary.data.totalQuantity.toLocaleString('en-US') : '—'}
        </AppText>
        <AppText variant="small">
          {summary.data && summary.data.spent > 0
            ? `items in your binder · ${peso(summary.data.spent)} spent so far`
            : 'items in your binder'}
        </AppText>
        <View style={styles.statRow}>
          <Stat value={summary.data?.cards} label="Cards" />
          <Stat value={summary.data?.graded} label="Graded" />
          <Stat value={summary.data?.sealed} label="Sealed" />
          <Stat value={summary.data?.items} label="Toys" />
        </View>
        <AppText variant="small" color={colors.textFaint}>
          Peso values arrive with the price guide in the next update.
        </AppText>
      </Surface>

      <View style={styles.quickRow} accessibilityLabel="Quick actions">
        {QUICK_ACTIONS.map((action) => (
          <Pressable
            key={action.label}
            accessibilityRole="button"
            onPress={() => router.push(action.href)}
            style={({ pressed }) => [styles.quick, pressed ? { opacity: 0.85 } : null]}
          >
            <View style={styles.quickIcon}>
              <Icon name={action.icon} size={22} color={colors.accent} />
            </View>
            <AppText variant="smallStrong">{action.label}</AppText>
          </Pressable>
        ))}
      </View>

      {isEmpty ? (
        <Surface style={{ gap: 12 }}>
          <AppText variant="heading">Start your binder</AppText>
          <AppText variant="body" color={colors.textMuted}>
            Search for a card by name or number, or add a toy or sealed product. Set progress shows
            up as soon as you add your first card.
          </AppText>
          <Button label="Add your first item" icon="plus" onPress={() => router.push('/add')} />
        </Surface>
      ) : null}

      {progress.data && progress.data.length > 0 ? (
        <View style={styles.section}>
          <SectionHeader title="Set progress" action={{ label: 'Open binder', onPress: () => router.push('/binder') }} />
          <Surface style={styles.listSurface}>
            {progress.data.slice(0, 3).map((set, index) => {
              const pct = percent(set.owned_cards, set.total_cards);
              return (
                <Pressable
                  key={set.set_id}
                  accessibilityRole="link"
                  accessibilityLabel={`${set.name}, ${set.owned_cards} of ${set.total_cards} cards`}
                  onPress={() => router.push({ pathname: '/binder/[setId]', params: { setId: set.set_id } })}
                  style={[styles.setRow, index > 0 ? styles.rowDivider : null]}
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
                  <AppText variant="small">{pct}% complete</AppText>
                </Pressable>
              );
            })}
          </Surface>
        </View>
      ) : null}

      {recent.data && recent.data.length > 0 ? (
        <View style={styles.section}>
          <SectionHeader title="Recently added" />
          <View style={styles.recentGrid}>
            {recent.data.map((entry) => {
              const title = entry.card?.name ?? entry.item?.name ?? 'Item';
              const subtitle = entry.card
                ? `${entry.card.set?.name ?? ''} · ${entry.card.number}`
                : [entry.item?.brand, entry.item?.line].filter(Boolean).join(' · ');
              return (
                <View key={entry.id} style={styles.recentItem}>
                  <CardArt
                    gameId={entry.card?.game_id ?? entry.item?.game_id}
                    imageUrl={entry.card?.image_small ?? entry.item?.image_url}
                    width={96}
                  />
                  <AppText variant="smallStrong" numberOfLines={1}>
                    {title}
                  </AppText>
                  <AppText variant="small" numberOfLines={1}>
                    {entry.kind === 'graded' && entry.grader ? `${entry.grader} ${entry.grade}` : subtitle}
                  </AppText>
                </View>
              );
            })}
          </View>
        </View>
      ) : null}

      {summary.error ? <Notice tone="error">{summary.error}</Notice> : null}
    </Screen>
  );
}

function Stat({ value, label }: { value: number | undefined; label: string }) {
  return (
    <View style={styles.stat}>
      <AppText variant="displaySmall" style={{ fontSize: 24, lineHeight: 30 }}>
        {value ?? '—'}
      </AppText>
      <AppText variant="small">{label}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  greeting: { gap: 8 },
  badges: { flexDirection: 'row', gap: 6 },
  summary: { gap: 6 },
  statRow: {
    flexDirection: 'row',
    marginTop: 10,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 8,
  },
  stat: { flex: 1 },
  quickRow: { flexDirection: 'row', gap: 10 },
  quick: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  quickIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: { gap: 12 },
  listSurface: { padding: 0, overflow: 'hidden' },
  setRow: { paddingHorizontal: 16, paddingVertical: 14, gap: 8 },
  rowDivider: { borderTopWidth: 1, borderTopColor: colors.surface3 },
  setRowTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  recentGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  recentItem: { width: 96, gap: 4 },
});

