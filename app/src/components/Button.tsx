import { forwardRef } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { colors } from '@/lib/theme';

import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

type Variant = 'primary' | 'discord' | 'outline' | 'ghost' | 'danger';

type ButtonProps = {
  label: string;
  onPress?: (event: GestureResponderEvent) => void;
  variant?: Variant;
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  size?: 'md' | 'lg';
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

const variantStyles: Record<Variant, { bg: string; fg: string; border: string }> = {
  primary: { bg: colors.accent, fg: colors.onAccent, border: colors.accent },
  discord: { bg: colors.discord, fg: '#FFFFFF', border: colors.discord },
  outline: { bg: 'transparent', fg: colors.text, border: colors.borderStrong },
  ghost: { bg: 'transparent', fg: colors.text, border: 'transparent' },
  danger: { bg: colors.dangerBg, fg: colors.down, border: '#40201E' },
};

/** A real button: reachable by keyboard and screen readers, 44px or taller. */
export const Button = forwardRef<View, ButtonProps>(function Button(
  {
    label,
    onPress,
    variant = 'primary',
    icon,
    disabled = false,
    loading = false,
    size = 'md',
    accessibilityLabel,
    style,
  },
  ref,
) {
  const look = variantStyles[variant];
  const inactive = disabled || loading;
  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        size === 'lg' ? styles.large : styles.medium,
        { backgroundColor: look.bg, borderColor: look.border },
        pressed && !inactive ? styles.pressed : null,
        disabled ? styles.disabled : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={look.fg} />
      ) : (
        <>
          {icon ? <Icon name={icon} size={18} color={look.fg} strokeWidth={2} /> : null}
          <AppText variant="bodyStrong" color={look.fg} numberOfLines={1}>
            {label}
          </AppText>
        </>
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 18,
  },
  medium: { minHeight: 44 },
  large: { minHeight: 52, borderRadius: 14, paddingHorizontal: 22 },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.5 },
});
