const pesoFormatter = (() => {
  try {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  } catch {
    return null;
  }
})();

export function peso(amount: number | string): string {
  const value = Number(amount);
  if (pesoFormatter) return pesoFormatter.format(value);
  return `₱${Math.round(value).toLocaleString('en-US')}`;
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

/** "just now", "5m", "3h", "2d", or a date for older times. */
export function timeAgo(iso: string, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

/** Clock time for chat bubbles, e.g. "3:41 PM". */
export function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
}

/** Parses "₱1,500" or "1500.50" into a number, or null if it isn't a price. */
export function parsePeso(text: string): number | null {
  const cleaned = text.replace(/[^\d.]/g, '');
  if (!cleaned) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : null;
}

export const kindLabels: Record<string, string> = {
  card: 'Raw card',
  graded: 'Graded slab',
  sealed: 'Sealed',
  item: 'Toy or collectible',
};

export const conditionLabels: Record<string, string> = {
  NM: 'Near mint',
  LP: 'Lightly played',
  MP: 'Moderately played',
  HP: 'Heavily played',
  DMG: 'Damaged',
};
