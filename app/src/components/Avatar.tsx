import { Image, StyleSheet, View } from 'react-native';

import { colors, fonts } from '@/lib/theme';

import { AppText } from './AppText';

const TINTS = ['#FF8A5C', '#7FA6FF', '#F2C94C', '#5ED6C4', '#B79CFF', '#FF7A9C'];

function initials(name: string | null | undefined): string {
  const words = (name ?? '?').trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? '?').slice(0, 2);
  return letters.toUpperCase();
}

function tintFor(seed: string | null | undefined): string {
  let hash = 0;
  for (const char of seed ?? '') hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return TINTS[hash % TINTS.length];
}

/** A member's Discord picture, or their initials on a colored circle. */
export function Avatar({
  uri,
  name,
  seed,
  size = 40,
}: {
  uri: string | null | undefined;
  name: string | null | undefined;
  seed?: string | null;
  size?: number;
}) {
  const round = { width: size, height: size, borderRadius: size / 2 };
  if (uri) {
    return <Image source={{ uri }} style={[styles.image, round]} accessibilityIgnoresInvertColors />;
  }
  return (
    <View style={[styles.fallback, round, { backgroundColor: tintFor(seed ?? name) }]}>
      <AppText style={{ fontFamily: fonts.extrabold, fontSize: Math.round(size * 0.36), color: colors.onAccent }}>
        {initials(name)}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  image: { backgroundColor: colors.surface3 },
  fallback: { alignItems: 'center', justifyContent: 'center' },
});
