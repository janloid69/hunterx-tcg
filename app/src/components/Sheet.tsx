import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { colors } from '@/lib/theme';

import { AppText } from './AppText';
import { Icon } from './Icon';

/** A panel that slides up from the bottom (centered on computers). */
export function Sheet({
  visible,
  title,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.wrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdrop} accessibilityLabel="Close" onPress={onClose} />
        <View style={styles.sheet} accessibilityViewIsModal>
          <View style={styles.header}>
            <AppText variant="heading" accessibilityRole="header" style={{ flex: 1 }}>
              {title}
            </AppText>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={styles.close}>
              <Icon name="close" size={20} color={colors.text} strokeWidth={2} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Yes/no question before something that can't be undone easily. */
export function ConfirmSheet({
  visible,
  title,
  message,
  confirmLabel,
  danger = false,
  busy = false,
  onConfirm,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  children?: ReactNode;
}) {
  return (
    <Sheet visible={visible} title={title} onClose={onClose}>
      <AppText variant="body" color={colors.textMuted}>
        {message}
      </AppText>
      {children}
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={onConfirm}
          style={[styles.action, danger ? styles.danger : styles.primary, busy ? { opacity: 0.6 } : null]}
        >
          <AppText variant="bodyStrong" color={danger ? colors.down : colors.onAccent}>
            {busy ? 'Working…' : confirmLabel}
          </AppText>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onClose} style={[styles.action, styles.outline]}>
          <AppText variant="bodyStrong">Cancel</AppText>
        </Pressable>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    maxHeight: '88%',
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    backgroundColor: '#16161A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
  },
  header: { flexDirection: 'row', alignItems: 'center', paddingLeft: 20, paddingRight: 8, paddingTop: 8 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  body: { padding: 20, paddingTop: 8, gap: 16 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  action: {
    minHeight: 48,
    paddingHorizontal: 18,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexGrow: 1,
  },
  primary: { backgroundColor: colors.accent, borderColor: colors.accent },
  danger: { backgroundColor: colors.dangerBg, borderColor: '#5A2A27' },
  outline: { backgroundColor: 'transparent', borderColor: colors.borderStrong },
});
