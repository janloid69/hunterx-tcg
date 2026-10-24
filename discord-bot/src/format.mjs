// Small text helpers shared by everything the bot writes to Discord.

const pesoFormat = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** 1500 -> '₱1,500' */
export function peso(amount) {
  return pesoFormat.format(Number(amount) || 0);
}

/** Cuts text to fit a Discord limit, ending with an ellipsis when cut. */
export function truncate(text, max) {
  const value = String(text ?? '');
  return value.length > max ? `${value.slice(0, Math.max(0, max - 1)).trimEnd()}…` : value;
}

/** Stops member-written text from turning into Discord formatting or links. */
export function escapeMarkdown(text) {
  return String(text ?? '')
    .replace(/([\\*_~`|[\]()<>])/g, '\\$1')
    .replace(/^(\s*)([#>-])/gm, '$1\\$2');
}

/** Puts text in a Discord quote block, line by line. */
export function quote(text) {
  return String(text ?? '')
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');
}

export function memberName(profile) {
  return profile?.display_name || profile?.username || 'A member';
}

/** A clickable Discord mention when we know their account, else their name. */
export function mention(profile) {
  return profile?.discord_id ? `<@${profile.discord_id}>` : `**${escapeMarkdown(memberName(profile))}**`;
}

export function stars(rating) {
  const value = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
  return '★'.repeat(value) + '☆'.repeat(5 - value);
}

/** Discord's own timestamp format, shown in each reader's time zone. */
export function discordTime(iso, style = 'R') {
  const seconds = Math.floor(new Date(iso).getTime() / 1000);
  return Number.isFinite(seconds) ? `<t:${seconds}:${style}>` : '';
}

export const kindLabels = {
  card: 'Raw card',
  graded: 'Graded slab',
  sealed: 'Sealed',
  item: 'Toy or collectible',
};

export const conditionLabels = {
  NM: 'Near mint',
  LP: 'Lightly played',
  MP: 'Moderately played',
  HP: 'Heavily played',
  DMG: 'Damaged',
};

export const reportReasons = {
  scam: 'Scam or fraud',
  fake: 'Fake or counterfeit item',
  prohibited: 'Not allowed on HunterX',
  harassment: 'Harassment or abuse',
  spam: 'Spam',
  other: 'Something else',
};
