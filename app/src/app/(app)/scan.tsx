import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Image, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { AddToBinderForm } from '@/components/AddToBinder';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { CardArt } from '@/components/CardArt';
import { CardScanner, type ScannerStatus } from '@/components/CardScanner';
import { ChipRow } from '@/components/Chip';
import { PriceLine } from '@/components/Prices';
import { Notice, Screen, Surface, TextField } from '@/components/ui';
import { peso } from '@/lib/format';
import { getCardPrices, type CardPrice } from '@/lib/prices';
import { findCards } from '@/lib/scanLookup';
import { parseScanText, parseTypedNumber, type ScanGuess } from '@/lib/scanParse';
import { errorMessage } from '@/lib/supabase';
import { colors, wideBreakpoint } from '@/lib/theme';
import type { CardWithSet } from '@/lib/types';

type Mode = 'single' | 'bulk';

const showNumber = (guess: ScanGuess) =>
  guess.game === 'pokemon' ? `${guess.setCode ? `${guess.setCode} ` : ''}${guess.number}${guess.total ? `/${guess.total}` : ''}` : guess.number;

export default function ScanScreen() {
  const { width, height } = useWindowDimensions();
  const wide = width >= wideBreakpoint;
  const [focused, setFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  const [mode, setMode] = useState<Mode>('single');
  const [scannerNote, setScannerNote] = useState<string | null>(null);
  const [lastRead, setLastRead] = useState<string | null>(null);
  const [matchedNumber, setMatchedNumber] = useState<string | null>(null);
  const [matches, setMatches] = useState<CardWithSet[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [prices, setPrices] = useState<Map<string, CardPrice>>(new Map());
  const [added, setAdded] = useState<string | null>(null);
  const [addedCardId, setAddedCardId] = useState<string | null>(null);
  const [session, setSession] = useState({ count: 0, value: 0 });
  const [typed, setTyped] = useState('');
  const [typedError, setTypedError] = useState<string | null>(null);
  const [finding, setFinding] = useState(false);
  const busy = useRef(false);
  // The camera keeps reading while a card is showing; these decide when to switch.
  const lookups = useRef(new Map<string, { guess: ScanGuess | null; cards: CardWithSet[]; at: number }>());
  const shownKey = useRef<string | null>(null);
  const pending = useRef<{ key: string; at: number } | null>(null);
  const ignored = useRef<{ key: string; until: number } | null>(null);

  const selected = matches.find((card) => card.id === selectedId) ?? null;
  const selectedPrice = selected ? prices.get(selected.id) : undefined;

  /** Looks up a number once a minute at most; the camera reads the same one many times a second. */
  const lookup = useCallback(async (guesses: ScanGuess[]) => {
    const cacheKey = guesses.map((guess) => guess.key).join('|');
    const cached = lookups.current.get(cacheKey);
    if (cached && Date.now() - cached.at < 60_000) return cached;
    const found = { ...(await findCards(guesses)), at: Date.now() };
    lookups.current.set(cacheKey, found);
    return found;
  }, []);

  /** Shows the card for what was read. Returns true when a card is (now) showing. */
  const showMatches = useCallback(async (guesses: ScanGuess[], fromCamera: boolean): Promise<boolean> => {
    if (guesses.length === 0) return false;
    const { guess, cards } = await lookup(guesses);
    if (guess) setLastRead(showNumber(guess));
    if (!guess || cards.length === 0) return false;

    const key = guess.key;
    if (fromCamera) {
      if (key === shownKey.current) {
        pending.current = null; // same card still in view
        return true;
      }
      if (ignored.current && ignored.current.key === key && Date.now() < ignored.current.until) return false;
      // A different card while one is showing: switch once it's read twice in a row,
      // so one stray read doesn't replace what you're looking at.
      if (shownKey.current !== null && (pending.current?.key !== key || Date.now() - pending.current.at > 4000)) {
        pending.current = { key, at: Date.now() };
        return false;
      }
    }
    pending.current = null;
    shownKey.current = key;
    setMatchedNumber(showNumber(guess));
    setMatches(cards);
    setSelectedId(cards[0].id);
    setAddedCardId(null);
    setScannerNote(null);
    if (Platform.OS === 'web') (globalThis.navigator as Navigator | undefined)?.vibrate?.(60);
    getCardPrices(cards.map((card) => card.id))
      .then(setPrices)
      .catch(() => {});
    return true;
  }, [lookup]);

  const onText = useCallback(
    async (text: string) => {
      if (busy.current) return false;
      busy.current = true;
      try {
        await showMatches(parseScanText(text), true);
      } catch {
        // a failed lookup just means trying again on the next read
      } finally {
        busy.current = false;
      }
      return false; // keep reading: pointing at another card switches to it
    },
    [showMatches],
  );

  const onStatus = useCallback((status: ScannerStatus, detail?: string) => {
    setScannerNote(detail ?? (status === 'no-match' ? 'No card number found.' : null));
  }, []);

  /** Clears the card on screen. The same number is ignored for a few seconds so it doesn't pop right back. */
  function clearResult(ignoreSeconds = 5) {
    if (shownKey.current) ignored.current = { key: shownKey.current, until: Date.now() + ignoreSeconds * 1000 };
    shownKey.current = null;
    pending.current = null;
    setMatches([]);
    setSelectedId(null);
    setAddedCardId(null);
    setMatchedNumber(null);
  }

  async function findTyped() {
    const guesses = parseTypedNumber(typed);
    setTypedError(null);
    if (guesses.length === 0) {
      setTypedError('Type the number at the bottom of the card, like OP01-120 or 238/191. To search by name, use the price guide.');
      return;
    }
    setFinding(true);
    try {
      const found = await showMatches(guesses, false);
      if (!found) setTypedError(`No card found for ${showNumber(guesses[0])}.`);
      else setAdded(null);
    } catch (cause) {
      setTypedError(errorMessage(cause));
    } finally {
      setFinding(false);
    }
  }

  function onAdded({ quantity }: { quantity: number }) {
    if (!selected) return;
    const value = selectedPrice?.value_php ?? 0;
    setSession((current) => ({ count: current.count + quantity, value: current.value + value * quantity }));
    setAdded(`Added ${selected.name}${quantity > 1 ? ` ×${quantity}` : ''} to your binder.`);
    if (mode === 'bulk') clearResult(3);
    else setAddedCardId(selected.id);
  }

  const cameraHeight = wide ? 440 : Math.round(Math.min(Math.max(height * 0.48, 280), 460));

  const scanner = (
    <View style={{ gap: 8 }}>
      <CardScanner enabled={focused} reading={focused} height={cameraHeight} onText={onText} onStatus={onStatus} />
      {scannerNote ? <Notice tone="info">{scannerNote}</Notice> : null}
      {lastRead && matches.length === 0 ? (
        <AppText variant="small" style={{ textAlign: 'center' }}>
          Read {lastRead}, but no card matched yet. Hold steady and fill the box with the number.
        </AppText>
      ) : null}
    </View>
  );

  const result = selected ? (
    <Surface style={{ gap: 14 }}>
      <AppText variant="eyebrow">
        {matchedNumber ? `Number found · ${matchedNumber}` : 'Match found'}
      </AppText>
      {matches.length > 1 ? (
        <View style={{ gap: 8 }}>
          <AppText variant="small">{matches.length} cards share this number. Tap yours:</AppText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
            {matches.map((card) => (
              <Pressable
                key={card.id}
                accessibilityRole="button"
                accessibilityLabel={`${card.name}, ${card.set?.name ?? ''}`}
                accessibilityState={{ selected: card.id === selectedId }}
                onPress={() => setSelectedId(card.id)}
                style={card.id === selectedId ? styles.choiceOn : styles.choice}
              >
                <CardArt gameId={card.game_id} imageUrl={card.image_small} width={64} height={90} />
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      <View style={styles.match}>
        {selected.image_small ? (
          <Image source={{ uri: selected.image_large ?? selected.image_small }} style={styles.matchImage} resizeMode="contain" accessibilityIgnoresInvertColors />
        ) : (
          <CardArt gameId={selected.game_id} width={96} height={134} />
        )}
        <View style={{ flex: 1, gap: 4, minWidth: 0 }}>
          <AppText variant="heading">{selected.name}</AppText>
          <AppText variant="small">{[selected.set?.name, `#${selected.number}`, selected.rarity].filter(Boolean).join(' · ')}</AppText>
          {selectedPrice?.value_php !== null && selectedPrice?.value_php !== undefined ? (
            <AppText variant="title">{peso(selectedPrice.value_php)}</AppText>
          ) : null}
          <PriceLine price={selectedPrice} />
        </View>
      </View>

      <AddToBinderForm key={selected.id} cardId={selected.id} onAdded={onAdded} />

      {addedCardId === selected.id ? (
        <AppText variant="small" color={colors.up}>
          Added. Point the camera at your next card and it switches by itself.
        </AppText>
      ) : null}

      <View style={styles.resultActions}>
        <Button label={addedCardId === selected.id ? 'Clear' : 'Not this card'} variant="outline" onPress={() => clearResult()} />
        <Button label="Price guide" variant="ghost" icon="chart" onPress={() => router.push({ pathname: '/card/[id]', params: { id: selected.id } })} />
      </View>
    </Surface>
  ) : null;

  return (
    <Screen>
      <View style={styles.titleRow}>
        <AppText variant="displaySmall" accessibilityRole="header" style={{ flex: 1 }}>
          SCAN A CARD
        </AppText>
        <ChipRow<Mode>
          accessibilityLabel="Scan mode"
          options={[
            { value: 'single', label: 'Single' },
            { value: 'bulk', label: 'Bulk' },
          ]}
          value={mode}
          onChange={setMode}
        />
      </View>
      <AppText variant="body" color={colors.textMuted}>
        {mode === 'bulk'
          ? 'Bulk: after you add a card it clears, ready for the next one. Great for a stack of pulls.'
          : 'Point your camera at the number in the card’s bottom corner, like OP01-120 or 238/191. Move to another card any time and it switches by itself.'}
      </AppText>

      {added ? <Notice tone="success">{added}</Notice> : null}
      {session.count > 0 ? (
        <Surface style={styles.session}>
          <AppText variant="label" style={{ flex: 1 }}>
            This session
          </AppText>
          <AppText variant="bodyStrong">
            {session.count} card{session.count === 1 ? '' : 's'}
            {session.value > 0 ? ` · ${peso(session.value)}` : ''}
          </AppText>
        </Surface>
      ) : null}

      <View style={wide ? styles.columns : { gap: 16 }}>
        <View style={wide ? { flex: 1, maxWidth: 560 } : null}>{scanner}</View>
        <View style={wide ? { flex: 1, gap: 16 } : { gap: 16 }}>
          {result}

          <Surface style={{ gap: 10 }}>
            <AppText variant="bodyStrong">Type the number instead</AppText>
            <View style={styles.typedRow}>
              <View style={{ flex: 1 }}>
                <TextField
                  label="Card number"
                  hideLabel
                  value={typed}
                  onChangeText={setTyped}
                  placeholder="OP01-120, 238/191 or SSP 238"
                  autoCapitalize="characters"
                  autoCorrect={false}
                  returnKeyType="search"
                  onSubmitEditing={findTyped}
                />
              </View>
              <Button label="Find" icon="search" loading={finding} onPress={findTyped} />
            </View>
            {typedError ? <AppText variant="small" color={colors.down}>{typedError}</AppText> : null}
          </Surface>

          <View style={{ gap: 4 }}>
            <AppText variant="smallStrong">Tips</AppText>
            <AppText variant="small">• Good light helps most. Tap the ⚡ button to turn on your phone’s light.</AppText>
            <AppText variant="small">• Hold the card flat and fill the box with the number. Use 2× zoom instead of getting too close.</AppText>
            <AppText variant="small">• Reading happens on your phone. Nothing is uploaded.</AppText>
          </View>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12 },
  columns: { flexDirection: 'row', alignItems: 'flex-start', gap: 24 },
  session: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  match: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  matchImage: { width: 96, height: 134, borderRadius: 8, backgroundColor: '#16161A' },
  choice: { borderRadius: 10, borderWidth: 2, borderColor: 'transparent', padding: 2 },
  choiceOn: { borderRadius: 10, borderWidth: 2, borderColor: colors.accent, padding: 2 },
  resultActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  typedRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
});
