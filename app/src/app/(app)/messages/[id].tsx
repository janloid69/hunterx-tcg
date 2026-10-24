import { router, useLocalSearchParams } from 'expo-router';
import { type ComponentRef, useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { AppText } from '@/components/AppText';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { CardArt } from '@/components/CardArt';
import { Icon } from '@/components/Icon';
import { ReportSheet, SafetyTips } from '@/components/Safety';
import { ConfirmSheet, Sheet } from '@/components/Sheet';
import { Badge, Notice, TextField } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { clockTime, parsePeso, peso } from '@/lib/format';
import {
  answerOffer,
  blockMember,
  getConversation,
  getMessages,
  haveIBlocked,
  markConversationRead,
  photoUrl,
  sendMessage,
  sendOffer,
  subscribeToConversation,
  unblockMember,
} from '@/lib/market';
import { errorMessage } from '@/lib/supabase';
import { colors, fonts, maxContentWidth } from '@/lib/theme';
import type { Message } from '@/lib/types';
import { useQuery } from '@/lib/useQuery';

function friendlyError(cause: unknown): string {
  const code = (cause as { code?: string } | null)?.code;
  if (code === '42501') return "You can't message this member.";
  return errorMessage(cause);
}

export default function ChatScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id ?? '';
  const { session } = useAuth();
  const me = session?.user.id ?? '';

  const convo = useQuery(() => getConversation(id), [id]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<'menu' | 'offer' | 'block' | 'report-user' | null>(null);
  const [reportMessage, setReportMessage] = useState<Message | null>(null);
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);

  const isBuyer = convo.data?.buyer_id === me;
  const other = isBuyer ? convo.data?.seller : convo.data?.buyer;
  const otherId = isBuyer ? convo.data?.seller_id : convo.data?.buyer_id;
  const blocked = useQuery(() => (otherId ? haveIBlocked(otherId) : Promise.resolve(false)), [otherId]);

  const refresh = useCallback(async () => {
    try {
      const next = await getMessages(id);
      setMessages(next);
      setLoaded(true);
      markConversationRead(id).catch(() => {});
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }, [id]);

  useEffect(() => {
    refresh();
    const unsubscribe = subscribeToConversation(id, refresh);
    const timer = setInterval(refresh, 20000); // backup in case live updates drop
    return () => {
      unsubscribe();
      clearInterval(timer);
    };
  }, [id, refresh]);

  async function send() {
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    setError(null);
    try {
      await sendMessage(id, body);
      setDraft('');
      await refresh();
    } catch (cause) {
      setError(friendlyError(cause));
    } finally {
      setSending(false);
    }
  }

  async function answer(message: Message, status: 'accepted' | 'declined' | 'withdrawn') {
    setError(null);
    try {
      await answerOffer(message.id, status);
      await refresh();
    } catch (cause) {
      setError(friendlyError(cause));
    }
  }

  if (convo.loading && !convo.data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  if (!convo.data) {
    return (
      <View style={styles.center}>
        <AppText variant="heading">Chat not found</AppText>
        <Button label="Back to Messages" onPress={() => router.replace('/messages')} />
      </View>
    );
  }

  const listing = convo.data.listing;
  const listingImage = listing?.photos?.[0] ? photoUrl(listing.photos[0]) : listing?.card?.image_small ?? listing?.item?.image_url ?? null;
  const otherName = other?.display_name ?? other?.username ?? 'Member';
  const iBlocked = blocked.data === true;

  return (
    <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <View style={styles.headerInner}>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Back to messages"
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/messages'))}
            style={styles.iconButton}
          >
            <Icon name="chevronLeft" size={24} color={colors.text} strokeWidth={2} />
          </Pressable>
          <Pressable
            accessibilityRole="link"
            onPress={() => otherId && router.push({ pathname: '/u/[id]', params: { id: otherId } })}
            style={styles.person}
          >
            <Avatar uri={other?.avatar_url} name={otherName} seed={otherId} size={36} />
            <View style={{ flexShrink: 1 }}>
              <AppText variant="bodyStrong" numberOfLines={1}>
                {otherName}
              </AppText>
              <View style={styles.badges}>
                {other?.is_verified_seller ? <Badge label="Verified Seller" /> : null}
                <AppText variant="small" style={{ fontSize: 12 }}>
                  {isBuyer ? 'Seller' : 'Buyer'}
                </AppText>
              </View>
            </View>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Chat options" onPress={() => setSheet('menu')} style={styles.iconButton}>
            <Icon name="more" size={24} color={colors.text} strokeWidth={2.4} />
          </Pressable>
        </View>
        {listing ? (
          <Pressable
            accessibilityRole="link"
            onPress={() => router.push({ pathname: '/market/[id]', params: { id: listing.id } })}
            style={styles.listingStrip}
          >
            <CardArt gameId={listing.game_id} imageUrl={listingImage} width={36} height={46} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <AppText variant="smallStrong" numberOfLines={1}>
                {listing.title}
              </AppText>
              <AppText variant="small" style={{ fontSize: 12 }}>
                {peso(listing.price)}
                {listing.status !== 'active' ? ` · ${listing.status === 'reserved' ? 'Reserved' : listing.status === 'sold' ? 'Sold' : 'Removed'}` : ''}
              </AppText>
            </View>
            <Icon name="chevronRight" size={18} color={colors.textFaint} strokeWidth={2} />
          </Pressable>
        ) : (
          <View style={styles.listingStrip}>
            <AppText variant="small">This listing was removed.</AppText>
          </View>
        )}
      </View>

      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={styles.messages}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
      >
        <SafetyTips compact role={isBuyer ? 'buyer' : 'seller'} />
        {!loaded ? <ActivityIndicator color={colors.accent} /> : null}
        {messages.map((message) => (
          <Bubble
            key={message.id}
            message={message}
            mine={message.sender_id === me}
            isSeller={!isBuyer}
            onAnswer={(status) => answer(message, status)}
            onReport={() => setReportMessage(message)}
          />
        ))}
      </ScrollView>

      <View style={styles.composerWrap}>
        {error ? <Notice tone="error">{error}</Notice> : null}
        {iBlocked ? (
          <Notice tone="info">
            <AppText variant="body" color={colors.textSoft}>
              You blocked {otherName}. Neither of you can send messages.
            </AppText>
            <Button
              label="Unblock"
              variant="outline"
              onPress={async () => {
                if (otherId) await unblockMember(otherId);
                blocked.reload();
              }}
            />
          </Notice>
        ) : (
          <View style={styles.composer}>
            {isBuyer ? (
              <Pressable accessibilityRole="button" onPress={() => setSheet('offer')} style={styles.offerButton}>
                <AppText variant="smallStrong" color={colors.accent}>
                  Offer
                </AppText>
              </Pressable>
            ) : null}
            <TextInput
              accessibilityLabel="Message"
              placeholder="Write a message"
              placeholderTextColor={colors.textFaint}
              value={draft}
              onChangeText={setDraft}
              multiline
              maxLength={2000}
              style={styles.input}
              onKeyPress={(event) => {
                const native = event.nativeEvent as { key: string; shiftKey?: boolean };
                if (Platform.OS === 'web' && native.key === 'Enter' && !native.shiftKey) {
                  (event as unknown as { preventDefault: () => void }).preventDefault();
                  send();
                }
              }}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send"
              disabled={sending || draft.trim().length === 0}
              onPress={send}
              style={[styles.send, draft.trim().length === 0 ? { opacity: 0.4 } : null]}
            >
              {sending ? <ActivityIndicator color={colors.onAccent} /> : <Icon name="send" size={20} color={colors.onAccent} strokeWidth={2} />}
            </Pressable>
          </View>
        )}
      </View>

      <Sheet visible={sheet === 'menu'} title="Chat options" onClose={() => setSheet(null)}>
        {listing ? (
          <MenuItem icon="tag" label="View listing" onPress={() => { setSheet(null); router.push({ pathname: '/market/[id]', params: { id: listing.id } }); }} />
        ) : null}
        <MenuItem icon="user" label={`View ${otherName}'s profile`} onPress={() => { setSheet(null); if (otherId) router.push({ pathname: '/u/[id]', params: { id: otherId } }); }} />
        <MenuItem icon="flag" label={`Report ${otherName}`} onPress={() => setSheet('report-user')} />
        {iBlocked ? (
          <MenuItem icon="block" label={`Unblock ${otherName}`} onPress={async () => { if (otherId) await unblockMember(otherId); blocked.reload(); setSheet(null); }} />
        ) : (
          <MenuItem icon="block" label={`Block ${otherName}`} danger onPress={() => setSheet('block')} />
        )}
        <AppText variant="small">To report a single message, press and hold it.</AppText>
      </Sheet>

      <ConfirmSheet
        visible={sheet === 'block'}
        title={`Block ${otherName}?`}
        message="Neither of you will be able to send messages or start new chats with each other. You can unblock them later."
        confirmLabel="Block"
        danger
        onClose={() => setSheet(null)}
        onConfirm={async () => {
          if (otherId) await blockMember(otherId).catch((cause) => setError(errorMessage(cause)));
          blocked.reload();
          setSheet(null);
        }}
      />

      <OfferSheet visible={sheet === 'offer'} conversationId={id} askingPrice={listing?.price ?? null} onClose={() => setSheet(null)} onSent={refresh} />

      <ReportSheet
        visible={sheet === 'report-user'}
        onClose={() => setSheet(null)}
        target={{ userId: otherId, label: otherName }}
      />
      <ReportSheet
        visible={reportMessage !== null}
        onClose={() => setReportMessage(null)}
        target={{ messageId: reportMessage?.id, label: 'message' }}
      />
    </KeyboardAvoidingView>
  );
}

function Bubble({
  message,
  mine,
  isSeller,
  onAnswer,
  onReport,
}: {
  message: Message;
  mine: boolean;
  isSeller: boolean;
  onAnswer: (status: 'accepted' | 'declined' | 'withdrawn') => void;
  onReport: () => void;
}) {
  if (message.kind === 'system') {
    return (
      <View style={styles.system} accessibilityRole="text">
        <AppText variant="small" color={colors.textSoft} style={{ textAlign: 'center' }}>
          {message.body}
        </AppText>
      </View>
    );
  }

  const time = clockTime(message.created_at);

  if (message.kind === 'offer') {
    const status = message.offer_status ?? 'pending';
    const statusLabel = {
      pending: isSeller ? 'Waiting for your answer' : 'Waiting for the seller',
      accepted: 'Accepted',
      declined: 'Declined',
      withdrawn: 'Withdrawn',
    }[status];
    return (
      <Pressable
        onLongPress={mine ? undefined : onReport}
        accessibilityHint={mine ? undefined : 'Press and hold to report'}
        style={[styles.offer, mine ? styles.alignRight : styles.alignLeft]}
      >
        <AppText variant="eyebrow">{mine ? 'Your offer' : 'Offer'}</AppText>
        <AppText variant="displaySmall">{peso(message.offer_amount ?? 0)}</AppText>
        {message.body ? <AppText variant="body">{message.body}</AppText> : null}
        <AppText
          variant="smallStrong"
          color={status === 'accepted' ? colors.up : status === 'declined' ? colors.down : colors.textMuted}
        >
          {statusLabel}
        </AppText>
        {status === 'pending' && isSeller ? (
          <View style={styles.offerActions}>
            <Button label="Accept" icon="check" onPress={() => onAnswer('accepted')} style={{ flexGrow: 1 }} />
            <Button label="Decline" variant="outline" onPress={() => onAnswer('declined')} style={{ flexGrow: 1 }} />
          </View>
        ) : null}
        {status === 'pending' && mine ? (
          <Button label="Withdraw offer" variant="ghost" onPress={() => onAnswer('withdrawn')} />
        ) : null}
        <AppText variant="small" style={{ fontSize: 11 }}>
          {time}
        </AppText>
      </Pressable>
    );
  }

  return (
    <Pressable
      onLongPress={mine ? undefined : onReport}
      accessibilityHint={mine ? undefined : 'Press and hold to report'}
      style={[styles.bubble, mine ? styles.mine : styles.theirs]}
    >
      <AppText variant="body" color={mine ? colors.onAccent : colors.text} selectable>
        {message.body}
      </AppText>
      <AppText variant="small" color={mine ? 'rgba(14,14,16,0.6)' : colors.textFaint} style={{ fontSize: 11, alignSelf: 'flex-end' }}>
        {time}
      </AppText>
    </Pressable>
  );
}

function MenuItem({
  icon,
  label,
  danger = false,
  onPress,
}: {
  icon: 'tag' | 'user' | 'flag' | 'block';
  label: string;
  danger?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.menuItem}>
      <Icon name={icon} size={20} color={danger ? colors.down : colors.text} />
      <AppText variant="bodyStrong" color={danger ? colors.down : colors.text}>
        {label}
      </AppText>
    </Pressable>
  );
}

function OfferSheet({
  visible,
  conversationId,
  askingPrice,
  onClose,
  onSent,
}: {
  visible: boolean;
  conversationId: string;
  askingPrice: number | null;
  onClose: () => void;
  onSent: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const value = parsePeso(amount);

  async function submit() {
    if (!value) return;
    setBusy(true);
    setError(null);
    try {
      await sendOffer(conversationId, value, note);
      setAmount('');
      setNote('');
      onClose();
      onSent();
    } catch (cause) {
      setError(friendlyError(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet visible={visible} title="Make an offer" onClose={onClose}>
      {askingPrice ? (
        <AppText variant="body" color={colors.textMuted}>
          Asking price is {peso(askingPrice)}.
        </AppText>
      ) : null}
      <TextField label="Your offer (₱)" placeholder="e.g. 1200" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
      <TextField label="Message (optional)" value={note} onChangeText={setNote} maxLength={300} />
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Button label={value ? `Send offer of ${peso(value)}` : 'Send offer'} loading={busy} disabled={!value} onPress={submit} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24, backgroundColor: colors.bg },
  header: { borderBottomWidth: 1, borderBottomColor: colors.divider, backgroundColor: colors.bg },
  headerInner: {
    width: '100%',
    maxWidth: maxContentWidth,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingTop: 6,
  },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  person: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  badges: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  listingStrip: {
    width: '100%',
    maxWidth: maxContentWidth,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  messages: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    padding: 16,
    gap: 10,
  },
  bubble: { maxWidth: '82%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9, gap: 2 },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.accent, borderBottomRightRadius: 6 },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.surface2, borderBottomLeftRadius: 6 },
  alignRight: { alignSelf: 'flex-end' },
  alignLeft: { alignSelf: 'flex-start' },
  offer: {
    width: 280,
    maxWidth: '88%',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    padding: 14,
    gap: 6,
  },
  offerActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  system: {
    alignSelf: 'center',
    maxWidth: '90%',
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  composerWrap: {
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    backgroundColor: colors.bgRaised,
    padding: 10,
    gap: 8,
  },
  composer: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  offerButton: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.accent,
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 140,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    paddingHorizontal: 16,
    paddingTop: 11,
    paddingBottom: 11,
    fontFamily: fonts.regular,
    fontSize: 15,
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
});
