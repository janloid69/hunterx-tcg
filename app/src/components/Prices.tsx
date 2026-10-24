import { StyleSheet, View } from 'react-native';

import { peso, timeAgo } from '@/lib/format';
import type { CardPrice } from '@/lib/prices';
import { colors } from '@/lib/theme';

import { AppText } from './AppText';

/** One line: "HunterX ₱1,250 · Global ≈ ₱1,480", for tiles, sheets and listings. */
export function PriceLine({ price, align = 'left' }: { price: CardPrice | null | undefined; align?: 'left' | 'right' }) {
  const parts: string[] = [];
  if (price?.local_php !== null && price?.local_php !== undefined) parts.push(`HunterX ${peso(price.local_php)}`);
  if (price?.global_php !== null && price?.global_php !== undefined) parts.push(`Global ≈ ${peso(price.global_php)}`);
  return (
    <AppText variant="small" numberOfLines={1} style={{ textAlign: align }}>
      {parts.length ? parts.join(' · ') : 'No price yet'}
    </AppText>
  );
}

/** The two prices side by side, with what each one means. */
export function PriceGuidePanel({ price }: { price: CardPrice | null | undefined }) {
  const hasLocal = price?.local_php !== null && price?.local_php !== undefined;
  const hasGlobal = price?.global_php !== null && price?.global_php !== undefined;

  return (
    <View style={styles.panel}>
      <View style={styles.block}>
        <AppText variant="eyebrow">HunterX price</AppText>
        {hasLocal ? (
          <>
            <AppText variant="display" style={styles.big}>
              {peso(price!.local_php!)}
            </AppText>
            <AppText variant="small">
              Typical price from {price!.local_sales} recent raw sale{price!.local_sales === 1 ? '' : 's'} (Near mint or
              Lightly played)
              {price!.local_sales > 1 && price!.local_low !== null && price!.local_high !== null
                ? `, ${peso(price!.local_low)} to ${peso(price!.local_high)}`
                : ''}
              .
            </AppText>
            {price!.last_sold_php !== null && price!.last_sold_at ? (
              <AppText variant="small">
                Last sold for {peso(price!.last_sold_php)} {timeAgo(price!.last_sold_at)}.
              </AppText>
            ) : null}
          </>
        ) : (
          <>
            <AppText variant="title" color={colors.textMuted}>
              No sales yet
            </AppText>
            <AppText variant="small">
              Sold or bought this card lately? Log the sale and it starts this card’s peso price.
            </AppText>
          </>
        )}
      </View>

      <View style={[styles.block, styles.divider]}>
        <AppText variant="eyebrow">Global price</AppText>
        {hasGlobal ? (
          <>
            <AppText variant="title" style={styles.medium}>
              ≈ {peso(price!.global_php!)}
            </AppText>
            <AppText variant="small">
              {price!.global_source === 'Cardmarket' ? 'Cardmarket (Europe)' : 'TCGplayer (US)'} market price in pesos at
              today’s rate
              {price!.global_updated_at ? `, updated ${timeAgo(price!.global_updated_at)}` : ''}. Prices here can be quite
              different.
            </AppText>
          </>
        ) : (
          <AppText variant="small">No global price for this card.</AppText>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  block: { flexGrow: 1, flexBasis: 240, gap: 4 },
  divider: { borderLeftWidth: 1, borderLeftColor: colors.surface3, paddingLeft: 16 },
  big: { fontSize: 36, lineHeight: 42 },
  medium: { fontSize: 24, lineHeight: 30 },
});
