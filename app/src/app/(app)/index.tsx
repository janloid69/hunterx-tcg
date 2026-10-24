import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { CardArt } from '@/components/CardArt';
import { Icon, type IconName } from '@/components/Icon';
import { ListingCard } from '@/components/ListingCard';
import { Badge, Notice, ProgressBar, Screen, SectionHeader, Surface } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { getCollectionSummary, getRecentItems, getSetProgress } from '@/lib/data';
import { getCollectionValue } from '@/lib/prices';
import { greeting, percent, peso } from '@/lib/format';
import { getListings } from '@/lib/market';
import { discordInviteUrl } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { useQuery } from '@/lib/useQuery';

// Remembered on this device only; members can always join from Community.
const HIDE_JOIN_KEY = 'hx:hide-join-discord';

function useJoinNoticeHidden(): [boolean, () => void] {
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    AsyncStorage.getItem(HIDE_JOIN_KEY)
      .then((value) => setHidden(value === '1'))
      .catch(() => setHidden(false));
  }, []);
  const hide = () => {
    setHidden(true);
    AsyncStorage.setItem(HIDE_JOIN_KEY, '1').catch(() => {});
  };
  return [hidden, hide];
}

const QUICK_ACTIONS: { label: string; icon: IconName; href: '/add' | '/scan' | '/prices' | '/market' }[] = [
  { label: 'Add', icon: 'plus', href: '/add' },
  { label: 'Scan', icon: 'scan', href: '/scan' },
  { label: 'Prices', icon: 'chart', href: '/prices' },
  { label: 'Market', icon: 'market', href: '/market' },
];

export default function HomeScreen() {
  const { profile, roleSyncError } = useAuth();
  const [joinHidden, hideJoin] = useJoinNoticeHidden();
  const summary = useQuery(getCollectionSummary, []);
  const value = useQuery(getCollectionValue, []);
  const recent = useQuery(() => getRecentItems(6), []);
  const progress = useQuery(getSetProgress, []);
  const fresh = useQuery(() => getListings({ limit: 8 }), []);

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

      {profile && !profile.in_guild && !joinHidden ? (
        <Notice tone="discord">
          <View style={styles.noticeTop}>
            <AppText variant="bodyStrong" style={{ flex: 1 }}>
              Join the HunterX Discord to sell
            </AppText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Hide this message"
              onPress={hideJoin}
              style={styles.noticeClose}
            >
              <Icon name="close" size={18} color={colors.discordText} strokeWidth={2} />
            </Pressable>
          </View>
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
        {value.data && value.data.priced_cards > 0 ? (
          <Pressable accessibilityRole="link" onPress={() => router.push('/binder')}>
            <AppText variant="bodyStrong">
              Worth about {peso(value.data.value_php)}{' '}
              <AppText variant="small">
                ({value.data.priced_cards} of {value.data.raw_cards} raw cards priced)
              </AppText>
            </AppText>
          </Pressable>
        ) : (
          <AppText variant="small" color={colors.textFaint}>
            Your binder’s peso value shows here once your cards have prices. See the price guide.
          </AppText>
        )}
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

      {fresh.data && fresh.data.length > 0 ? (
        <View style={styles.section}>
          <SectionHeader title="Fresh listings" action={{ label: 'Market', onPress: () => router.push('/market') }} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.freshRow}>
            {fresh.data.map((listing) => (
              <ListingCard key={listing.id} listing={listing} width={150} />
            ))}
          </ScrollView>
        </View>
      ) : null}

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
  noticeTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: -10, marginRight: -10 },
  noticeClose: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
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
  freshRow: { gap: 14, paddingRight: 8 },
  listSurface: { padding: 0, overflow: 'hidden' },
  setRow: { paddingHorizontal: 16, paddingVertical: 14, gap: 8 },
  rowDivider: { borderTopWidth: 1, borderTopColor: colors.surface3 },
  setRowTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  recentGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  recentItem: { width: 96, gap: 4 },
});

