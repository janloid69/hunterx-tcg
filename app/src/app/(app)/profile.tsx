import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Switch, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Icon, type IconName } from '@/components/Icon';
import { InstallCard } from '@/components/InstallCard';
import { ConfirmSheet } from '@/components/Sheet';
import { Badge, Notice, Screen, SectionHeader, Surface, TextField } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { deleteMyAccount, getMyBlocks, setDiscordDms, unblockMember } from '@/lib/market';
import { errorMessage } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { useQuery } from '@/lib/useQuery';

export default function ProfileScreen() {
  const { profile, session, roleSyncError, signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [typed, setTyped] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const blocks = useQuery(getMyBlocks, []);
  const [dms, setDms] = useState(profile?.discord_dms ?? true);
  useEffect(() => {
    if (profile) setDms(profile.discord_dms ?? true);
  }, [profile]);

  async function toggleDms(next: boolean) {
    setDms(next);
    setError(null);
    try {
      await setDiscordDms(next);
    } catch (cause) {
      setDms(!next);
      setError(errorMessage(cause));
    }
  }

  const synced = profile?.roles_synced_at ? new Date(profile.roles_synced_at) : null;
  const me = session?.user.id;

  async function deleteAccount() {
    setDeleting(true);
    setError(null);
    try {
      await deleteMyAccount();
    } catch (cause) {
      setError(errorMessage(cause));
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  return (
    <Screen>
      <AppText variant="displaySmall" accessibilityRole="header">
        YOUR PROFILE
      </AppText>

      <Surface style={styles.card}>
        <View style={styles.avatar}>
          {profile?.avatar_url ? (
            <Image source={{ uri: profile.avatar_url }} style={styles.avatarImage} accessibilityIgnoresInvertColors />
          ) : (
            <Icon name="user" size={32} color={colors.text} />
          )}
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <AppText variant="heading">{profile?.display_name ?? 'Collector'}</AppText>
          {profile?.username ? <AppText variant="small">@{profile.username} on Discord</AppText> : null}
          <View style={styles.badges}>
            {profile?.is_verified_seller ? <Badge label="Verified Seller" /> : null}
            {profile?.is_mod ? <Badge label="Mod" tone="mod" /> : null}
            {profile && !profile.in_guild ? <Badge label="Not in the HunterX Discord" tone="muted" /> : null}
          </View>
        </View>
      </Surface>

      {roleSyncError ? (
        <Notice tone="error">{`We couldn't read your Discord roles: ${roleSyncError}`}</Notice>
      ) : null}
      {error ? <Notice tone="error">{error}</Notice> : null}

      <Surface style={styles.links}>
        {me ? <LinkRow icon="user" label="View your public profile" onPress={() => router.push({ pathname: '/u/[id]', params: { id: me } })} /> : null}
        <LinkRow icon="tag" label="My listings" onPress={() => router.push('/market/mine')} />
        <LinkRow icon="chat" label="Messages" onPress={() => router.push('/messages')} />
        {profile?.is_mod ? <LinkRow icon="shield" label="Mod tools: reports and catalog" onPress={() => router.push('/mod')} /> : null}
        <LinkRow icon="flag" label="House rules and privacy" onPress={() => router.push('/rules')} />
      </Surface>

      <InstallCard />

      <Surface style={styles.dmRow}>
        <View style={{ flex: 1, gap: 4 }}>
          <AppText variant="bodyStrong">Discord DMs</AppText>
          <AppText variant="small">
            The HunterX bot DMs you about new messages, offers, finished deals and your reports. Only works while you’re
            in the HunterX Discord.
          </AppText>
        </View>
        <Switch
          accessibilityLabel="Discord DMs from the HunterX bot"
          value={dms}
          onValueChange={toggleDms}
          trackColor={{ false: colors.surface3, true: colors.accent }}
          thumbColor={colors.text}
        />
      </Surface>

      <Surface style={{ gap: 8 }}>
        <AppText variant="bodyStrong">Discord roles</AppText>
        <AppText variant="small">
          {synced
            ? `Last checked ${synced.toLocaleString()}. Roles are checked each time you sign in.`
            : 'Roles are checked each time you sign in.'}
        </AppText>
        <AppText variant="small">
          Got the hunterxcircle role just now? Sign out and back in to get your Verified Seller badge.
        </AppText>
      </Surface>

      <View style={{ gap: 12 }}>
        <SectionHeader title="Blocked members" />
        {blocks.data && blocks.data.length === 0 ? <AppText variant="small">You haven’t blocked anyone.</AppText> : null}
        {(blocks.data ?? []).length > 0 ? (
          <Surface style={{ padding: 0, overflow: 'hidden' }}>
            {(blocks.data ?? []).map((member, index) => (
              <View key={member.id} style={[styles.blockRow, index > 0 ? styles.divider : null]}>
                <Avatar uri={member.avatar_url} name={member.display_name} seed={member.id} size={32} />
                <AppText variant="bodyStrong" style={{ flex: 1 }}>
                  {member.display_name ?? member.username ?? 'Member'}
                </AppText>
                <Button
                  label="Unblock"
                  variant="outline"
                  onPress={async () => {
                    await unblockMember(member.id).catch((cause) => setError(errorMessage(cause)));
                    blocks.reload();
                  }}
                />
              </View>
            ))}
          </Surface>
        ) : null}
      </View>

      {session?.user.email ? <AppText variant="small">Signed in as {session.user.email}</AppText> : null}

      <Button
        label="Sign out"
        variant="outline"
        icon="logout"
        loading={busy}
        onPress={async () => {
          setBusy(true);
          await signOut();
        }}
      />

      <Surface style={{ gap: 10 }}>
        <AppText variant="bodyStrong">Delete account</AppText>
        <AppText variant="small">
          Deletes your profile, binder, listings and photos, chats, vouches and blocks for good. Final sale prices stay in
          the price guide without your name. Your Discord account isn’t affected.
        </AppText>
        <Button label="Delete my account" variant="danger" icon="trash" onPress={() => setConfirmDelete(true)} />
      </Surface>

      <ConfirmSheet
        visible={confirmDelete}
        title="Delete your HunterX account?"
        message="This can't be undone. Type DELETE to confirm."
        confirmLabel={typed.trim().toUpperCase() === 'DELETE' ? 'Delete everything' : 'Type DELETE first'}
        danger
        busy={deleting}
        onClose={() => {
          setConfirmDelete(false);
          setTyped('');
        }}
        onConfirm={() => {
          if (typed.trim().toUpperCase() === 'DELETE') deleteAccount();
        }}
      >
        <TextField label="Type DELETE" value={typed} onChangeText={setTyped} autoCapitalize="characters" />
      </ConfirmSheet>
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
  card: { flexDirection: 'row', gap: 16, alignItems: 'center' },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: colors.accent,
    backgroundColor: colors.surface3,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: { width: 60, height: 60, borderRadius: 30 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  links: { paddingVertical: 4 },
  dmRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  blockRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  divider: { borderTopWidth: 1, borderTopColor: colors.surface3 },
});
