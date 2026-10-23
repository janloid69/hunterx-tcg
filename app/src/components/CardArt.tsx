import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { paletteFor } from '@/lib/theme';

import { Icon } from './Icon';

type CardArtProps = {
  gameId: string | null | undefined;
  imageUrl?: string | null;
  width: number;
  /** Card ratio is 5:7 unless a height is given (sealed boxes, toys). */
  height?: number;
  dimmed?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** Card picture when the data source has one, otherwise a neutral placeholder. */
export function CardArt({ gameId, imageUrl, width, height, dimmed = false, style }: CardArtProps) {
  const h = height ?? Math.round((width * 7) / 5);
  const palette = paletteFor(gameId);
  const radius = Math.max(6, Math.round(width / 14));

  if (imageUrl) {
    return (
      <Image
        source={{ uri: imageUrl }}
        accessibilityIgnoresInvertColors
        resizeMode="cover"
        style={[{ width, height: h, borderRadius: radius, opacity: dimmed ? 0.35 : 1 }, style]}
      />
    );
  }

  const pad = Math.max(4, Math.round(width / 18));
  return (
    <View
      style={[
        styles.frame,
        {
          width,
          height: h,
          borderRadius: radius,
          padding: pad,
          gap: pad,
          backgroundColor: palette.bg,
          borderColor: palette.edge,
          opacity: dimmed ? 0.35 : 1,
        },
        style,
      ]}
    >
      <View style={[styles.bar, { width: '65%', height: Math.max(4, pad + 2), backgroundColor: palette.win }]} />
      <View style={[styles.window, { backgroundColor: palette.win, borderRadius: radius - 2 }]}>
        <Icon name="sparkle" size={Math.round(width * 0.32)} color={palette.ac} strokeWidth={1.4} />
      </View>
      <View style={[styles.bar, { width: '85%', height: Math.max(3, pad - 1), backgroundColor: palette.win }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { borderWidth: 1, overflow: 'hidden' },
  bar: { borderRadius: 3 },
  window: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
