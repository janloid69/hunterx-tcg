import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { REPORT_REASONS, fileReport } from '@/lib/market';
import { errorMessage } from '@/lib/supabase';
import { colors, fonts } from '@/lib/theme';
import type { ReportReason } from '@/lib/types';

import { AppText } from './AppText';
import { Button } from './Button';
import { Icon } from './Icon';
import { Sheet } from './Sheet';
import { Notice, TextField } from './ui';

const SHARED_TIPS = [
  'Keep the whole deal in this chat. Be careful if someone pushes you to rush or move to another app.',
  'HunterX never asks for your password or a payment to “verify” your account.',
];

/** Tips for buyers first, then the ones everyone needs. */
export const SAFETY_TIPS = [
  'Check the seller’s vouches and Verified Seller badge before paying.',
  'Meet in a busy public place, like a mall, and check the item before you pay.',
  'For shipping, ask for a photo or video of the item with your name and today’s date.',
  ...SHARED_TIPS,
];

export const SELLER_SAFETY_TIPS = [
  'Wait until the money shows in your GCash, Maya or bank app. Payment screenshots can be faked.',
  'Meet in a busy public place, like a mall, and count cash before you hand over the item.',
  'For shipping, take a video while packing the item and keep the tracking number.',
  ...SHARED_TIPS,
];

export function SafetyTips({ compact = false, role = 'buyer' }: { compact?: boolean; role?: 'buyer' | 'seller' }) {
  const all = role === 'seller' ? SELLER_SAFETY_TIPS : SAFETY_TIPS;
  const tips = compact ? all.slice(0, 3) : all;
  return (
    <View style={styles.tips} accessibilityRole="summary">
      <View style={styles.tipsTitle}>
        <Icon name="shield" size={18} color={colors.up} />
        <AppText variant="bodyStrong">Stay safe when trading</AppText>
      </View>
      {tips.map((tip) => (
        <View key={tip} style={styles.tip}>
          <AppText variant="small" color={colors.textSoft}>
            •
          </AppText>
          <AppText variant="small" color={colors.textSoft} style={{ flex: 1 }}>
            {tip}
          </AppText>
        </View>
      ))}
    </View>
  );
}

/** Lets a member report a listing, a member, or a message. */
export function ReportSheet({
  visible,
  onClose,
  target,
}: {
  visible: boolean;
  onClose: () => void;
  target: { listingId?: string; userId?: string; messageId?: string; label: string };
}) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  function close() {
    setReason(null);
    setDetails('');
    setError(null);
    setSent(false);
    onClose();
  }

  async function submit() {
    if (!reason) return;
    setBusy(true);
    setError(null);
    try {
      await fileReport({
        listingId: target.listingId,
        userId: target.userId,
        messageId: target.messageId,
        reason,
        details,
      });
      setSent(true);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet visible={visible} title={`Report ${target.label}`} onClose={close}>
      {sent ? (
        <>
          <Notice tone="success">Thanks. A HunterX mod will look at this within 24 hours.</Notice>
          <Button label="Done" onPress={close} />
        </>
      ) : (
        <>
          <AppText variant="body" color={colors.textMuted}>
            Reports go to the HunterX mods. The person you report isn’t told who reported them.
          </AppText>
          <View style={{ gap: 8 }} accessibilityRole="radiogroup">
            {REPORT_REASONS.map((option) => {
              const selected = option.value === reason;
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  onPress={() => setReason(option.value)}
                  style={[styles.reason, selected ? styles.reasonSelected : null]}
                >
                  <View style={[styles.radio, selected ? styles.radioOn : null]} />
                  <AppText variant="bodyStrong" style={{ fontFamily: selected ? fonts.bold : fonts.semibold }}>
                    {option.label}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
          <TextField
            label="What happened? (optional)"
            value={details}
            onChangeText={setDetails}
            multiline
            maxLength={1000}
            style={{ minHeight: 88, paddingTop: 12, textAlignVertical: 'top' }}
          />
          {error ? <Notice tone="error">{error}</Notice> : null}
          <Button label="Send report" icon="flag" loading={busy} disabled={!reason} onPress={submit} />
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  tips: {
    backgroundColor: colors.successBg,
    borderColor: '#24563A',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 8,
  },
  tipsTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tip: { flexDirection: 'row', gap: 8 },
  reason: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  reasonSelected: { borderColor: colors.accent },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: colors.borderStrong },
  radioOn: { borderColor: colors.accent, backgroundColor: colors.accent },
});
