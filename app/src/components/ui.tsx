import type { ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { colors, fonts, maxContentWidth } from '@/lib/theme';

import { AppText } from './AppText';
import { Icon } from './Icon';

/** Scrolling page body, centered with a max width on computers. */
export function Screen({
  children,
  contentStyle,
}: {
  children: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.screenContent}>
      <View style={[styles.column, contentStyle]}>{children}</View>
    </ScrollView>
  );
}

export function Surface({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.surface, style]}>{children}</View>;
}

export function SectionHeader({
  title,
  action,
}: {
  title: string;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <View style={styles.sectionHeader}>
      <AppText variant="heading" accessibilityRole="header">
        {title}
      </AppText>
      {action ? (
        <Pressable accessibilityRole="link" onPress={action.onPress} style={styles.sectionAction}>
          <AppText variant="label" color={colors.accent} style={{ fontFamily: fonts.bold }}>
            {action.label}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

export function ProgressBar({ percent }: { percent: number }) {
  const width = `${Math.max(0, Math.min(100, percent))}%` as const;
  return (
    <View
      style={styles.track}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(percent) }}
    >
      <View style={[styles.fill, { width }]} />
    </View>
  );
}

export function Stepper({
  value,
  onChange,
  min = 1,
  max = 999,
  label,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  label: string;
}) {
  return (
    <View style={styles.stepper}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Decrease ${label}`}
        disabled={value <= min}
        onPress={() => onChange(Math.max(min, value - 1))}
        style={[styles.stepButton, value <= min ? { opacity: 0.4 } : null]}
      >
        <Icon name="minus" size={18} color={colors.text} strokeWidth={2.2} />
      </Pressable>
      <AppText
        variant="title"
        accessibilityLiveRegion="polite"
        accessibilityLabel={`${label}: ${value}`}
        style={styles.stepValue}
      >
        {value}
      </AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Increase ${label}`}
        disabled={value >= max}
        onPress={() => onChange(Math.min(max, value + 1))}
        style={[styles.stepButton, value >= max ? { opacity: 0.4 } : null]}
      >
        <Icon name="plus" size={18} color={colors.text} strokeWidth={2.2} />
      </Pressable>
    </View>
  );
}

export function TextField({
  label,
  hideLabel = false,
  style,
  ...inputProps
}: TextInputProps & { label: string; hideLabel?: boolean }) {
  return (
    <View style={styles.field}>
      {hideLabel ? null : <AppText variant="label" color={colors.textSoft}>{label}</AppText>}
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.textFaint}
        style={[styles.input, style]}
        {...inputProps}
      />
    </View>
  );
}

export function Notice({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'error' | 'success' | 'discord';
  children: ReactNode;
}) {
  const look = {
    info: { bg: colors.surface2, border: colors.border, fg: colors.textSoft },
    error: { bg: colors.dangerBg, border: '#40201E', fg: colors.down },
    success: { bg: colors.successBg, border: '#24563A', fg: colors.up },
    discord: { bg: colors.discordSurface, border: colors.discordBorder, fg: colors.discordText },
  }[tone];
  return (
    <View
      accessibilityLiveRegion={tone === 'error' ? 'assertive' : 'polite'}
      style={[styles.notice, { backgroundColor: look.bg, borderColor: look.border }]}
    >
      {typeof children === 'string' ? (
        <AppText variant="body" color={look.fg}>
          {children}
        </AppText>
      ) : (
        children
      )}
    </View>
  );
}

export function Badge({ label, tone = 'verified' }: { label: string; tone?: 'verified' | 'mod' | 'muted' }) {
  const look = {
    verified: { bg: colors.verifiedBg, fg: colors.verifiedText },
    mod: { bg: colors.discordSurface, fg: colors.discordStrong },
    muted: { bg: colors.surface3, fg: colors.textSoft },
  }[tone];
  return (
    <View style={[styles.badge, { backgroundColor: look.bg }]}>
      {tone === 'verified' ? <Icon name="check" size={12} color={look.fg} strokeWidth={2.6} /> : null}
      <AppText variant="smallStrong" color={look.fg} style={{ fontSize: 12 }}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  screenContent: { paddingBottom: 40 },
  column: {
    width: '100%',
    maxWidth: maxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 24,
  },
  surface: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 18,
    padding: 18,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  sectionAction: { minHeight: 44, justifyContent: 'center' },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.surface3, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4, backgroundColor: colors.accent },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#2E2E35',
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepValue: { minWidth: 32, textAlign: 'center' },
  field: { gap: 6 },
  input: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    paddingHorizontal: 14,
    fontFamily: fonts.regular,
    fontSize: 15,
  },
  notice: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 10 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
});
