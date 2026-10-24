import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { CardArt } from '@/components/CardArt';
import { ChipRow } from '@/components/Chip';
import { Icon } from '@/components/Icon';
import { PriceLine } from '@/components/Prices';
import { Notice, Screen, SectionHeader, Surface, TextField } from '@/components/ui';
import { getGames, searchCards } from '@/lib/data';
import { conditionLabels, peso, timeAgo } from '@/lib/format';
import { getCardPrices, getRecentSales, saleLabel, type CardPrice } from '@/lib/prices';
import { errorMessage } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import type { CardWithSet } from '@/lib/types';
import { useQuery } from '@/lib/useQuery';

export default function PriceGuideScreen() {
  const games = useQuery(getGames, []);
  const tcgs = useMemo(() => (games.data ?? []).filter((game) => game.kind === 'tcg'), [games.data]);
  const [gameId, setGameId] = useState('');
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<CardWithSet[] | null>(null);
  const [prices, setPrices] = useState<Map<string, CardPrice>>(new Map());
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recent = useQuery(() => getRecentSales({ gameId: gameId || 'all', limit: 20 }), [gameId]);

  useEffect(() => {
    if (!gameId && tcgs.length > 0) setGameId(tcgs[0].id);
  }, [gameId, tcgs]);

  useEffect(() => {
    const clean = term.trim();
    if (!gameId || clean.length < 2) {
      setResults(null);
      return;
    }
    let active = true;
    const timer = setTimeout(async () => {
      setSearching(true);
      setError(null);
      try {
        const cards = await searchCards(gameId, clean);
        const found = await getCardPrices(cards.map((card) => card.id));
        if (!active) return;
        setResults(cards);
        setPrices(found);
      } catch (cause) {
        if (active) setError(errorMessage(cause));
      } finally {
        if (active) setSearching(false);
      }
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [gameId, term]);

  return (
    <Screen>
      <View style={styles.titleRow}>
        <AppText variant="displaySmall" accessibilityRole="header" style={{ flex: 1 }}>
          PRICE GUIDE
        </AppText>
        <Button label="Scan" icon="scan" variant="outline" onPress={() => router.push('/scan')} />
      </View>
      <AppText variant="body" color={colors.textMuted}>
        The HunterX price is what a card actually sold for here, in pesos. The global price is the US or EU market price
        converted at today’s rate, for reference.
      </AppText>

      {tcgs.length > 1 ? (
        <ChipRow accessibilityLabel="Game" options={tcgs.map((game) => ({ value: game.id, label: game.name }))} value={gameId} onChange={setGameId} scroll />
      ) : null}
      <TextField
        label="Search cards"
        hideLabel
        value={term}
        onChangeText={setTerm}
        placeholder="Card name or number, e.g. Charizard or OP01-120"
        autoCorrect={false}
        returnKeyType="search"
      />
      {error ? <Notice tone="error">{error}</Notice> : null}
      {searching ? <ActivityIndicator color={colors.accent} /> : null}

      {results ? (
        results.length === 0 ? (
          <AppText variant="small">No cards found. Try the number printed at the bottom of the card.</AppText>
        ) : (
          <Surface style={{ padding: 0, overflow: 'hidden' }}>
            {results.map((card, index) => (
              <CardRow key={card.id} card={card} price={prices.get(card.id)} first={index === 0} />
            ))}
          </Surface>
        )
      ) : (
        <View style={{ gap: 12 }}>
          <SectionHeader title="Latest sales" />
          {recent.loading && !recent.data ? <ActivityIndicator color={colors.accent} /> : null}
          {recent.data && recent.data.length === 0 ? (
            <AppText variant="small">
              No sales yet for this game. They show up here when listings are marked sold, or members log sales.
            </AppText>
          ) : null}
          {(recent.data ?? []).length > 0 ? (
            <Surface style={{ padding: 0, overflow: 'hidden' }}>
              {(recent.data ?? []).map((sale, index) => (
                <Pressable
                  key={sale.id}
                  accessibilityRole="link"
                  onPress={() => router.push({ pathname: '/card/[id]', params: { id: sale.card_id } })}
                  style={({ pressed }) => [styles.row, index > 0 ? styles.divider : null, pressed ? styles.pressed : null]}
                >
                  <CardArt gameId={sale.game_id} imageUrl={sale.image_small} width={40} height={56} />
                  <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
                    <AppText variant="bodyStrong" numberOfLines={1}>
                      {sale.name}
                    </AppText>
                    <AppText variant="small" numberOfLines={1}>
                      {[sale.set_name, `#${sale.number}`, saleLabel(sale, conditionLabels)].filter(Boolean).join(' · ')}
                    </AppText>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 2 }}>
                    <AppText variant="heading">{peso(sale.price)}</AppText>
                    <AppText variant="small">{timeAgo(sale.sold_at)}</AppText>
                  </View>
                </Pressable>
              ))}
            </Surface>
          ) : null}
        </View>
      )}
    </Screen>
  );
}

function CardRow({ card, price, first }: { card: CardWithSet; price: CardPrice | undefined; first: boolean }) {
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => router.push({ pathname: '/card/[id]', params: { id: card.id } })}
      style={({ pressed }) => [styles.row, first ? null : styles.divider, pressed ? styles.pressed : null]}
    >
      <CardArt gameId={card.game_id} imageUrl={card.image_small} width={40} height={56} />
      <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {card.name}
        </AppText>
        <AppText variant="small" numberOfLines={1}>
          {[card.set?.name, `#${card.number}`, card.rarity].filter(Boolean).join(' · ')}
        </AppText>
        <PriceLine price={price} />
      </View>
      <Icon name="chevronRight" size={18} color={colors.textFaint} strokeWidth={2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  divider: { borderTopWidth: 1, borderTopColor: colors.surface3 },
  pressed: { backgroundColor: colors.surface2 },
});
