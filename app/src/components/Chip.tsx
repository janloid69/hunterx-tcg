import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { colors, fonts } from '@/lib/theme';

import { AppText } from './AppText';

type ChipProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
};

export function Chip({ label, selected, onPress }: ChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected ? styles.selected : styles.idle,
        pressed ? { opacity: 0.85 } : null,
      ]}
    >
      <AppText
        variant="label"
        color={selected ? colors.onAccent : colors.text}
        style={{ fontFamily: selected ? fonts.bold : fonts.semibold }}
      >
        {label}
      </AppText>
    </Pressable>
  );
}

type ChipRowProps<T extends string> = {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel: string;
  scroll?: boolean;
};

/** A single-choice row of chips (game filter, condition, etc.). */
export function ChipRow<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
  scroll = false,
}: ChipRowProps<T>) {
  const chips = options.map((option) => (
    <Chip
      key={option.value}
      label={option.label}
      selected={option.value === value}
      onPress={() => onChange(option.value)}
    />
  ));
  if (scroll) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityLabel={accessibilityLabel}
        contentContainerStyle={styles.row}
      >
        {chips}
      </ScrollView>
    );
  }
  return (
    <View accessibilityLabel={accessibilityLabel} style={[styles.row, styles.wrap]}>
      {chips}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  wrap: { flexWrap: 'wrap' },
  chip: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  idle: { backgroundColor: colors.surface, borderColor: '#2E2E35' },
  selected: { backgroundColor: colors.accent, borderColor: colors.accent },
});
