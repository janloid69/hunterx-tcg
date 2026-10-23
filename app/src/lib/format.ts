const pesoFormatter = (() => {
  try {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      maximumFractionDigits: 0,
    });
  } catch {
    return null;
  }
})();

export function peso(amount: number): string {
  if (pesoFormatter) return pesoFormatter.format(amount);
  return `₱${Math.round(amount).toLocaleString('en-US')}`;
}

/** Tagalog greeting for the time of day, e.g. "Magandang hapon". */
export function greeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return 'Magandang umaga';
  if (hour < 18) return 'Magandang hapon';
  return 'Magandang gabi';
}

export function percent(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((part / total) * 100));
}

export const conditionLabels: Record<string, string> = {
  NM: 'Near mint',
  LP: 'Lightly played',
  MP: 'Moderately played',
  HP: 'Heavily played',
  DMG: 'Damaged',
};
