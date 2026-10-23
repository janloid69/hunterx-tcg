import { StyleSheet, Text, type TextProps } from 'react-native';

import { colors, fonts } from '@/lib/theme';

export type TextVariant =
  | 'display'
  | 'displaySmall'
  | 'title'
  | 'heading'
  | 'body'
  | 'bodyStrong'
  | 'label'
  | 'small'
  | 'smallStrong'
  | 'eyebrow';

type AppTextProps = TextProps & {
  variant?: TextVariant;
  color?: string;
};

export function AppText({ variant = 'body', color, style, ...rest }: AppTextProps) {
  return <Text {...rest} style={[styles.base, styles[variant], color ? { color } : null, style]} />;
}

const styles = StyleSheet.create({
  base: { color: colors.text },
  display: { fontFamily: fonts.display, fontSize: 40, lineHeight: 46, letterSpacing: 0.5 },
  displaySmall: { fontFamily: fonts.display, fontSize: 28, lineHeight: 34, letterSpacing: 0.5 },
  title: { fontFamily: fonts.extrabold, fontSize: 22, lineHeight: 28 },
  heading: { fontFamily: fonts.extrabold, fontSize: 18, lineHeight: 24 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22 },
  bodyStrong: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 22 },
  label: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18 },
  small: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: colors.textMuted },
  smallStrong: { fontFamily: fonts.bold, fontSize: 13, lineHeight: 18 },
  eyebrow: {
    fontFamily: fonts.bold,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
});
