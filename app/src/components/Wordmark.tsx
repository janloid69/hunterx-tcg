import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '@/lib/theme';

/** "HUNTERX" with the orange X, as on the Discord banner. */
export function Wordmark({ size = 28, showTcg = true }: { size?: number; showTcg?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.word, { fontSize: size, lineHeight: Math.round(size * 1.2) }]}>
        HUNTER<Text style={{ color: colors.accent }}>X</Text>
      </Text>
      {showTcg ? (
        <Text style={[styles.tcg, { fontSize: Math.round(size * 0.46) }]}>TCG</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  word: { fontFamily: fonts.display, color: colors.text, letterSpacing: 0.5 },
  tcg: {
    fontFamily: fonts.extrabold,
    color: colors.textMuted,
    letterSpacing: 1,
    transform: [{ rotate: '-6deg' }],
  },
});
