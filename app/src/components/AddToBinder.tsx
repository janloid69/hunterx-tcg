import { useState } from 'react';
import { View } from 'react-native';

import { addToCollection } from '@/lib/data';
import { conditionLabels } from '@/lib/format';
import { errorMessage } from '@/lib/supabase';
import type { Condition } from '@/lib/types';

import { AppText } from './AppText';
import { Button } from './Button';
import { ChipRow } from './Chip';
import { Sheet } from './Sheet';
import { Notice, Stepper } from './ui';

const CONDITIONS = (Object.keys(conditionLabels) as Condition[]).map((value) => ({ value, label: value }));

/** Condition, quantity and an Add button: used by the scanner and card pages. */
export function AddToBinderForm({
  cardId,
  onAdded,
  buttonLabel = 'Add to binder',
}: {
  cardId: string;
  onAdded: (added: { condition: Condition; quantity: number }) => void;
  buttonLabel?: string;
}) {
  const [condition, setCondition] = useState<Condition>('NM');
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setBusy(true);
    setError(null);
    try {
      await addToCollection({ cardId, kind: 'card', quantity, condition });
      onAdded({ condition, quantity });
      setQuantity(1);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: 12 }}>
      <View style={{ gap: 8 }}>
        <AppText variant="label">Condition · {conditionLabels[condition]}</AppText>
        <ChipRow<Condition> accessibilityLabel="Condition" options={CONDITIONS} value={condition} onChange={setCondition} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <AppText variant="label">Quantity</AppText>
        <Stepper label="copies" value={quantity} onChange={setQuantity} />
      </View>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Button label={buttonLabel} icon="plus" loading={busy} onPress={add} />
    </View>
  );
}

export function AddToBinderSheet({
  visible,
  cardId,
  cardName,
  onClose,
  onAdded,
}: {
  visible: boolean;
  cardId: string;
  cardName: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  return (
    <Sheet visible={visible} title={`Add ${cardName}`} onClose={onClose}>
      <AddToBinderForm cardId={cardId} onAdded={onAdded} />
    </Sheet>
  );
}
