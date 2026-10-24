import { useState } from 'react';
import { View } from 'react-native';

import { conditionLabels, parsePeso } from '@/lib/format';
import { logSale, manilaDate } from '@/lib/prices';
import { errorMessage } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import type { Condition, Grader } from '@/lib/types';

import { AppText } from './AppText';
import { Button } from './Button';
import { ChipRow } from './Chip';
import { Sheet } from './Sheet';
import { Notice, TextField } from './ui';

const CONDITIONS = (Object.keys(conditionLabels) as Condition[]).map((value) => ({ value, label: value }));
const GRADERS: { value: Grader; label: string }[] = ['PSA', 'BGS', 'CGC', 'TAG', 'Other'].map((value) => ({
  value: value as Grader,
  label: value,
}));
type When = 'today' | 'yesterday' | 'earlier';

/** Lets a Discord member record a sale they know about, for the peso price guide. */
export function LogSaleSheet({
  visible,
  cardId,
  cardName,
  onClose,
  onSaved,
}: {
  visible: boolean;
  cardId: string;
  cardName: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [priceText, setPriceText] = useState('');
  const [kind, setKind] = useState<'card' | 'graded'>('card');
  const [condition, setCondition] = useState<Condition>('NM');
  const [grader, setGrader] = useState<Grader>('PSA');
  const [gradeText, setGradeText] = useState('10');
  const [when, setWhen] = useState<When>('today');
  const [dateText, setDateText] = useState(manilaDate(2));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setPriceText('');
    setError(null);
    onClose();
  }

  async function save() {
    const price = parsePeso(priceText);
    if (!price) return setError('Enter the price it sold for, in pesos.');
    const grade = Number(gradeText);
    if (kind === 'graded' && !(grade >= 1 && grade <= 10)) return setError('Enter a grade from 1 to 10.');
    const soldOn = when === 'today' ? manilaDate(0) : when === 'yesterday' ? manilaDate(1) : dateText.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(soldOn)) return setError('Enter the date like 2026-10-20.');

    setBusy(true);
    setError(null);
    try {
      await logSale({ cardId, price, kind, condition, grader, grade, soldOn });
      setPriceText('');
      onSaved();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet visible={visible} title="Log a sale" onClose={close}>
      <AppText variant="body" color={colors.textMuted}>
        Sold or bought {cardName} somewhere else, like a Facebook group, a meetup or a shop? Log the price so the HunterX
        price stays real. Only the price, condition and date are shown, never your name.
      </AppText>
      <TextField label="Sold for (₱)" value={priceText} onChangeText={setPriceText} keyboardType="decimal-pad" placeholder="e.g. 1,500" />
      <View style={{ gap: 8 }}>
        <AppText variant="label">Card</AppText>
        <ChipRow<'card' | 'graded'>
          accessibilityLabel="Raw or graded"
          options={[
            { value: 'card', label: 'Raw' },
            { value: 'graded', label: 'Graded slab' },
          ]}
          value={kind}
          onChange={setKind}
        />
      </View>
      {kind === 'card' ? (
        <View style={{ gap: 8 }}>
          <AppText variant="label">Condition · {conditionLabels[condition]}</AppText>
          <ChipRow<Condition> accessibilityLabel="Condition" options={CONDITIONS} value={condition} onChange={setCondition} />
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          <AppText variant="label">Grading company</AppText>
          <ChipRow<Grader> accessibilityLabel="Grading company" options={GRADERS} value={grader} onChange={setGrader} />
          <TextField label="Grade" value={gradeText} onChangeText={setGradeText} keyboardType="decimal-pad" />
        </View>
      )}
      <View style={{ gap: 8 }}>
        <AppText variant="label">When</AppText>
        <ChipRow<When>
          accessibilityLabel="When it sold"
          options={[
            { value: 'today', label: 'Today' },
            { value: 'yesterday', label: 'Yesterday' },
            { value: 'earlier', label: 'Earlier' },
          ]}
          value={when}
          onChange={setWhen}
        />
        {when === 'earlier' ? (
          <TextField label="Date (year-month-day, within the last year)" value={dateText} onChangeText={setDateText} placeholder="2026-10-20" />
        ) : null}
      </View>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Button label="Save sale" icon="cash" loading={busy} onPress={save} />
    </Sheet>
  );
}
