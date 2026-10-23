import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { ListingCard } from '@/components/ListingCard';
import { ReportSheet } from '@/components/Safety';
import { ConfirmSheet } from '@/components/Sheet';
import { RatingSummary } from '@/components/Stars';
import { Badge, Notice, Screen, SectionHeader, Surface } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { timeAgo } from '@/lib/format';
import { blockMember, getMember, getMemberListings, getVouchesFor, haveIBlocked, unblockMember } from '@/lib/market';
import { errorMessage } from '@/lib/supabase';
import { colors, maxContentWidth } from '@/lib/theme';
import { useQuery } from '@/lib/useQuery';

export default function MemberScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id ?? '';
  const { session } = useAuth();
  const isMe = session?.user.id === id;
  const { width } = useWindowDimensions();

  const member = useQuery(() => getMember(id), [id]);
  const listings = useQuery(() => getMemberListings(id), [id]);
  const vouches = useQuery(() => getVouchesFor(id), [id]);
  const blocked = useQuery(() => (isMe ? Promise.resolve(false) : haveIBlocked(id)), [id, isMe]);
  const [sheet, setSheet] = useState<'report' | 'block' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const contentWidth = Math.min(width, maxContentWidth) - 40;
  const columns = Math.max(2, Math.min(6, Math.floor((contentWidth + 14) / 190)));
  const tileWidth = Math.floor((contentWidth - (columns - 1) * 14) / columns);

  const profile = member.data?.member ?? null;
  const stats = member.data?.stats ?? null;
  const name = profile?.display_name ?? profile?.username ?? 'Member';

  return (
    <Screen>
      <Pressable
        accessibilityRole="link"
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/market'))}
        style={styles.back}
      >
        <Icon name="chevronLeft" size={22} color={colors.text} strokeWidth={2} />
        <AppText variant="bodyStrong">Back</AppText>
      </Pressable>

      {member.loading && !member.data ? <ActivityIndicator color={colors.accent} /> : null}
      {member.error ? <Notice tone="error">{member.error}</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}

      {profile ? (
        <Surface style={styles.card}>
          <Avatar uri={profile.avatar_url} name={name} seed={profile.id} size={72} />
          <View style={{ flex: 1, gap: 6, minWidth: 0 }}>
            <AppText variant="title" accessibilityRole="header">
              {name}
            </AppText>
            {profile.username ? <AppText variant="small">@{profile.username} on Discord</AppText> : null}
            <View style={styles.badges}>
              {profile.is_verified_seller ? <Badge label="Verified Seller" /> : null}
              {profile.is_mod ? <Badge label="Mod" tone="mod" /> : null}
              {profile.in_guild && !profile.is_verified_seller ? <Badge label="HunterX member" tone="muted" /> : null}
            </View>
            <RatingSummary rating={stats?.rating_avg ?? null} count={stats?.vouch_count ?? 0} />
            <AppText variant="small">
              {stats ? `${stats.sold_listings} sold · ${stats.active_listings} for sale · ` : ''}
              Joined {profile.created_at ? new Date(profile.created_at).toLocaleDateString('en-PH', { month: 'short', year: 'numeric' }) : ''}
            </AppText>
          </View>
        </Surface>
      ) : null}

      {profile && !isMe ? (
        <View style={styles.actions}>
          <Button label="Report" variant="outline" icon="flag" onPress={() => setSheet('report')} />
          {blocked.data ? (
            <Button
              label="Unblock"
              variant="outline"
              icon="block"
              onPress={async () => {
                await unblockMember(id).catch((cause) => setError(errorMessage(cause)));
                blocked.reload();
              }}
            />
          ) : (
            <Button label="Block" variant="danger" icon="block" onPress={() => setSheet('block')} />
          )}
        </View>
      ) : null}

      <View style={{ gap: 12 }}>
        <SectionHeader title={isMe ? 'Your listings' : `For sale by ${name}`} />
        {listings.data && listings.data.length === 0 ? <AppText variant="small">Nothing for sale right now.</AppText> : null}
        <View style={styles.grid}>
          {(listings.data ?? []).map((listing) => (
            <ListingCard key={listing.id} listing={listing} width={tileWidth} />
          ))}
        </View>
      </View>

      <View style={{ gap: 12 }}>
        <SectionHeader title="Vouches" />
        {vouches.data && vouches.data.length === 0 ? (
          <AppText variant="small">No vouches yet. Vouches come from finished deals on HunterX.</AppText>
        ) : null}
        {(vouches.data ?? []).length > 0 ? (
          <Surface style={{ padding: 0, overflow: 'hidden' }}>
            {(vouches.data ?? []).map((vouch, index) => (
              <View key={vouch.id} style={[styles.vouch, index > 0 ? styles.divider : null]}>
                <Avatar uri={vouch.author?.avatar_url} name={vouch.author?.display_name} seed={vouch.author_id} size={32} />
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={styles.badges}>
                    <AppText variant="bodyStrong">{vouch.author?.display_name ?? vouch.author?.username ?? 'Member'}</AppText>
                    <View style={styles.stars} accessible accessibilityLabel={`${vouch.rating} out of 5 stars`}>
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Icon key={star} name="star" size={13} color={star <= vouch.rating ? colors.gold : colors.borderStrong} filled={star <= vouch.rating} />
                      ))}
                    </View>
                  </View>
                  {vouch.comment ? <AppText variant="body">{vouch.comment}</AppText> : null}
                  <AppText variant="small" style={{ fontSize: 12 }}>
                    {timeAgo(vouch.created_at)}
                  </AppText>
                </View>
              </View>
            ))}
          </Surface>
        ) : null}
      </View>

      <ReportSheet visible={sheet === 'report'} onClose={() => setSheet(null)} target={{ userId: id, label: name }} />
      <ConfirmSheet
        visible={sheet === 'block'}
        title={`Block ${name}?`}
        message="Neither of you will be able to message each other or start new chats. You can unblock them later."
        confirmLabel="Block"
        danger
        onClose={() => setSheet(null)}
        onConfirm={async () => {
          await blockMember(id).catch((cause) => setError(errorMessage(cause)));
          blocked.reload();
          setSheet(null);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, alignSelf: 'flex-start' },
  card: { flexDirection: 'row', gap: 16, alignItems: 'center' },
  badges: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  actions: { flexDirection: 'row', gap: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 24 },
  vouch: { flexDirection: 'row', gap: 12, padding: 16 },
  divider: { borderTopWidth: 1, borderTopColor: colors.surface3 },
  stars: { flexDirection: 'row', gap: 1 },
});
