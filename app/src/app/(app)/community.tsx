import { router } from 'expo-router';
import { ActivityIndicator, Linking, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { DropCard } from '@/components/DropCard';
import { Icon, type IconName } from '@/components/Icon';
import { Badge, Screen, SectionHeader, Surface } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { dropChannelUrl, getLatestDrops, getLatestVouches, getTopTraders } from '@/lib/community';
import { timeAgo } from '@/lib/format';
import { discordInviteUrl } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { useQuery } from '@/lib/useQuery';

const memberName = (person: { display_name: string | null; username: string | null } | null) =>
  person?.display_name ?? person?.username ?? 'A member';

export default function CommunityScreen() {
  const { profile } = useAuth();
  const drops = useQuery(() => getLatestDrops(10), []);
  const vouches = useQuery(() => getLatestVouches(8), []);
  const traders = useQuery(() => getTopTraders(10), []);

  return (
    <Screen>
      <AppText variant="displaySmall" accessibilityRole="header">
        COMMUNITY
      </AppText>

      <View style={styles.discordCard}>
        <View style={styles.titleRow}>
          <Icon name="chat" size={22} color={colors.discordIcon} />
          <AppText variant="heading">The HunterX Discord</AppText>
        </View>
        <AppText variant="body" color={colors.discordText}>
          {profile?.in_guild
            ? 'You’re a member. Your roles come with you into the site, and the HunterX bot posts new listings and vouches there.'
            : 'You’re not in the server yet. Join to sell, get badges, and catch pull nights and meetups.'}
        </AppText>
        {profile?.in_guild ? (
          <View style={styles.badges}>
            {profile.is_verified_seller ? <Badge label="Verified Seller" /> : null}
            {profile.is_mod ? <Badge label="Mod" tone="mod" /> : null}
            {!profile.is_verified_seller && !profile.is_mod ? <Badge label="Member" tone="muted" /> : null}
          </View>
        ) : null}
        <Button
          label={profile?.in_guild ? 'Open the Discord' : 'Join the Discord'}
          variant="discord"
          icon="external"
          onPress={() => Linking.openURL(discordInviteUrl)}
        />
      </View>

      <View style={styles.section}>
        <SectionHeader
          title="Upcoming drops"
          action={
            drops.data && drops.data.length > 0
              ? { label: 'Open #upcoming-drops', onPress: () => Linking.openURL(dropChannelUrl(drops.data![0])) }
              : undefined
          }
        />
        {drops.loading && !drops.data ? <ActivityIndicator color={colors.accent} /> : null}
        {drops.error ? <AppText variant="small">{drops.error}</AppText> : null}
        {drops.data && drops.data.length === 0 ? (
          <AppText variant="small">
            No drops posted yet. When the community shares an upcoming release or restock in #upcoming-drops on
            Discord, it shows up here.
          </AppText>
        ) : null}
        {(drops.data ?? []).map((drop) => (
          <DropCard key={drop.id} drop={drop} />
        ))}
      </View>

      <View style={styles.section}>
        <SectionHeader title="Latest vouches" />
        {vouches.data && vouches.data.length === 0 ? (
          <AppText variant="small">No vouches yet. They appear after deals are marked sold on the Market.</AppText>
        ) : null}
        {(vouches.data ?? []).length > 0 ? (
          <Surface style={{ padding: 0, overflow: 'hidden' }}>
            {(vouches.data ?? []).map((vouch, index) => (
              <Pressable
                key={vouch.id}
                accessibilityRole="link"
                onPress={() => vouch.subject && router.push({ pathname: '/u/[id]', params: { id: vouch.subject.id } })}
                style={({ pressed }) => [styles.row, index > 0 ? styles.divider : null, pressed ? styles.pressed : null]}
              >
                <Avatar uri={vouch.author?.avatar_url} name={memberName(vouch.author)} seed={vouch.author?.id} size={32} />
                <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
                  <AppText variant="body" numberOfLines={1}>
                    <AppText variant="bodyStrong">{memberName(vouch.author)}</AppText> vouched for{' '}
                    <AppText variant="bodyStrong">{memberName(vouch.subject)}</AppText>
                  </AppText>
                  <View style={styles.stars} accessible accessibilityLabel={`${vouch.rating} out of 5 stars`}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Icon key={star} name="star" size={13} color={star <= vouch.rating ? colors.gold : colors.borderStrong} filled={star <= vouch.rating} />
                    ))}
                    <AppText variant="small" style={{ marginLeft: 6, fontSize: 12 }}>
                      {timeAgo(vouch.created_at)}
                    </AppText>
                  </View>
                  {vouch.comment ? (
                    <AppText variant="small" color={colors.textSoft} numberOfLines={2}>
                      “{vouch.comment}”
                    </AppText>
                  ) : null}
                </View>
              </Pressable>
            ))}
          </Surface>
        ) : null}
      </View>

      <View style={styles.section}>
        <SectionHeader title="Top traders" />
        {traders.data && traders.data.length === 0 ? (
          <AppText variant="small">Finish a deal and get vouched to show up here.</AppText>
        ) : null}
        {(traders.data ?? []).length > 0 ? (
          <Surface style={{ padding: 0, overflow: 'hidden' }}>
            {(traders.data ?? []).map((trader, index) => (
              <Pressable
                key={trader.member.id}
                accessibilityRole="link"
                onPress={() => router.push({ pathname: '/u/[id]', params: { id: trader.member.id } })}
                style={({ pressed }) => [styles.row, index > 0 ? styles.divider : null, pressed ? styles.pressed : null]}
              >
                <AppText variant="heading" color={index < 3 ? colors.accent : colors.textMuted} style={styles.rank}>
                  {index + 1}
                </AppText>
                <Avatar uri={trader.member.avatar_url} name={memberName(trader.member)} seed={trader.member.id} size={36} />
                <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
                  <View style={styles.badges}>
                    <AppText variant="bodyStrong" numberOfLines={1}>
                      {memberName(trader.member)}
                    </AppText>
                    {trader.member.is_verified_seller ? <Badge label="Verified Seller" /> : null}
                  </View>
                  <AppText variant="small">
                    {trader.vouch_count} vouch{trader.vouch_count === 1 ? '' : 'es'}
                    {trader.rating_avg !== null ? ` · ★ ${trader.rating_avg.toFixed(1)}` : ''} · {trader.sold_listings} sold
                  </AppText>
                </View>
                <Icon name="chevronRight" size={18} color={colors.textFaint} strokeWidth={2} />
              </Pressable>
            ))}
          </Surface>
        ) : null}
      </View>

      <Surface style={{ paddingVertical: 4 }}>
        <LinkRow icon="chart" label="Price guide and latest sales" onPress={() => router.push('/prices')} />
        <LinkRow icon="shield" label="House rules and privacy" onPress={() => router.push('/rules')} />
      </Surface>
    </Screen>
  );
}

function LinkRow({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="link" onPress={onPress} style={({ pressed }) => [styles.linkRow, pressed ? { opacity: 0.8 } : null]}>
      <Icon name={icon} size={20} color={colors.text} />
      <AppText variant="bodyStrong" style={{ flex: 1 }}>
        {label}
      </AppText>
      <Icon name="chevronRight" size={18} color={colors.textFaint} strokeWidth={2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  discordCard: {
    backgroundColor: colors.discordSurface,
    borderColor: colors.discordBorder,
    borderWidth: 1,
    borderRadius: 16,
    padding: 18,
    gap: 12,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  section: { gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  divider: { borderTopWidth: 1, borderTopColor: colors.surface3 },
  pressed: { backgroundColor: colors.surface2 },
  stars: { flexDirection: 'row', alignItems: 'center', gap: 1 },
  rank: { width: 22, textAlign: 'center' },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
});
