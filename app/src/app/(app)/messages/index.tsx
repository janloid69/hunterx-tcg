import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { CardArt } from '@/components/CardArt';
import { ChipRow } from '@/components/Chip';
import { Icon } from '@/components/Icon';
import { Notice, Screen, Surface } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { peso, timeAgo } from '@/lib/format';
import { getInbox, photoUrl, subscribeToInbox } from '@/lib/market';
import { colors, fonts } from '@/lib/theme';
import type { InboxRow } from '@/lib/types';
import { useQuery } from '@/lib/useQuery';

type Filter = 'all' | 'buying' | 'selling';

function preview(row: InboxRow, me: string): string {
  if (!row.last_kind) return 'No messages yet';
  const mine = row.last_sender_id === me;
  if (row.last_kind === 'system') return row.last_body ?? '';
  if (row.last_kind === 'offer') {
    return `${mine ? 'You offered' : 'Offer:'} ${peso(row.last_offer_amount ?? 0)}`;
  }
  return `${mine ? 'You: ' : ''}${row.last_body ?? ''}`;
}

export default function InboxScreen() {
  const { session } = useAuth();
  const me = session?.user.id ?? '';
  const inbox = useQuery(getInbox, []);
  const [filter, setFilter] = useState<Filter>('all');

  const { reload } = inbox;
  useEffect(() => subscribeToInbox(reload), [reload]);

  const rows = (inbox.data ?? []).filter((row) =>
    filter === 'all' ? true : filter === 'buying' ? row.my_role === 'buyer' : row.my_role === 'seller',
  );

  return (
    <Screen>
      <AppText variant="displaySmall" accessibilityRole="header">
        MESSAGES
      </AppText>
      <ChipRow<Filter>
        accessibilityLabel="Show"
        options={[
          { value: 'all', label: 'All' },
          { value: 'buying', label: 'Buying' },
          { value: 'selling', label: 'Selling' },
        ]}
        value={filter}
        onChange={setFilter}
      />

      {inbox.error ? <Notice tone="error">{inbox.error}</Notice> : null}
      {inbox.loading && !inbox.data ? <ActivityIndicator color={colors.accent} /> : null}

      {!inbox.loading && rows.length === 0 ? (
        <Surface style={{ gap: 12 }}>
          <AppText variant="heading">No chats yet</AppText>
          <AppText variant="body" color={colors.textMuted}>
            When you message a seller, or a buyer messages you, the chat shows up here. You don’t need to be in the
            Discord to chat.
          </AppText>
          <Button label="Browse the Market" onPress={() => router.push('/market')} />
        </Surface>
      ) : null}

      {rows.length > 0 ? (
        <Surface style={styles.list}>
          {rows.map((row, index) => {
            const unread = row.unread_count > 0;
            const image = row.listing_photo ? photoUrl(row.listing_photo) : row.listing_card_image;
            return (
              <Pressable
                key={row.id}
                accessibilityRole="link"
                accessibilityLabel={`Chat with ${row.other_name ?? 'member'} about ${row.listing_title ?? 'a listing'}${unread ? `, ${row.unread_count} unread` : ''}`}
                onPress={() => router.push({ pathname: '/messages/[id]', params: { id: row.id } })}
                style={({ pressed }) => [
                  styles.row,
                  index > 0 ? styles.divider : null,
                  pressed ? { backgroundColor: colors.surface2 } : null,
                ]}
              >
                <View>
                  <CardArt gameId={row.listing_game_id} imageUrl={image} width={48} height={60} />
                  <View style={styles.avatarDot}>
                    <Avatar uri={row.other_avatar} name={row.other_name} seed={row.other_id} size={24} />
                  </View>
                </View>
                <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
                  <View style={styles.topLine}>
                    <AppText
                      variant="bodyStrong"
                      numberOfLines={1}
                      style={{ flexShrink: 1, fontFamily: unread ? fonts.extrabold : fonts.bold }}
                    >
                      {row.other_name ?? row.other_username ?? 'Member'}
                    </AppText>
                    {row.other_verified ? <Icon name="check" size={12} color={colors.verifiedText} strokeWidth={2.6} /> : null}
                    <AppText variant="small" style={{ marginLeft: 'auto', fontSize: 12 }}>
                      {timeAgo(row.last_message_at)}
                    </AppText>
                  </View>
                  <AppText variant="small" numberOfLines={1} style={{ fontSize: 12 }}>
                    {row.my_role === 'buyer' ? 'Buying' : 'Selling'} · {row.listing_title ?? 'Listing removed'}
                    {row.listing_status === 'sold' ? ' · Sold' : ''}
                  </AppText>
                  <AppText
                    variant="small"
                    numberOfLines={1}
                    color={unread ? colors.text : colors.textMuted}
                    style={unread ? { fontFamily: fonts.semibold } : null}
                  >
                    {preview(row, me)}
                  </AppText>
                </View>
                {unread ? (
                  <View style={styles.unread}>
                    <AppText variant="smallStrong" color={colors.onAccent} style={{ fontSize: 11 }}>
                      {row.unread_count > 9 ? '9+' : row.unread_count}
                    </AppText>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </Surface>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { padding: 0, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 12 },
  divider: { borderTopWidth: 1, borderTopColor: colors.surface3 },
  avatarDot: { position: 'absolute', right: -8, bottom: -6, borderRadius: 14, borderWidth: 2, borderColor: colors.surface },
  topLine: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  unread: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
