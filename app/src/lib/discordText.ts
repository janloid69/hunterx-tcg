// Turns a Discord post's text into plain text and links for the website:
// links (bare and [masked](https://…)) become tappable, **bold** stays bold,
// and other Markdown symbols are dropped. The bot has already turned mentions
// like <@&123> into names.

export type TextPart = { kind: 'text'; text: string; bold?: boolean } | { kind: 'link'; text: string; url: string; bold?: boolean };

const TOKEN = /\*\*([\s\S]+?)\*\*|\[([^\]\n]{1,200})\]\(<?(https?:\/\/[^\s)>]+)>?\)|<?(https?:\/\/[^\s<>]+)>?/g;
const TRAILING = /[.,!?;:'")\]]+$/;

/** "https://www.walmart.com/ip/POKEMON-30TH…" -> "walmart.com/ip/POKEMON-30TH…" */
export function shortUrl(url: string, max = 38): string {
  const plain = url.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '');
  return plain.length > max ? `${plain.slice(0, max - 1)}…` : plain;
}

function cleanLine(line: string): string {
  return line
    .replace(/^\s{0,3}(#{1,3}|-#)\s+/, '') // headings and small text
    .replace(/^\s*>{1,3}\s?/, '') // quotes
    .replace(/^(\s*)[*-]\s+/, '$1• '); // list bullets
}

function stripSymbols(text: string): string {
  return text.replace(/\|\||~~|__|```|`/g, '');
}

function tokenize(text: string, bold: boolean, parts: TextPart[]) {
  let last = 0;
  for (const match of text.matchAll(TOKEN)) {
    const start = match.index ?? 0;
    if (start > last) parts.push({ kind: 'text', text: stripSymbols(text.slice(last, start)), bold });
    const [whole, boldText, label, maskedUrl, bareUrl] = match;
    if (boldText !== undefined) {
      tokenize(boldText, true, parts);
    } else if (maskedUrl) {
      parts.push({ kind: 'link', text: stripSymbols(label), url: maskedUrl, bold });
    } else if (bareUrl) {
      const trailing = bareUrl.match(TRAILING)?.[0] ?? '';
      const url = trailing ? bareUrl.slice(0, -trailing.length) : bareUrl;
      parts.push({ kind: 'link', text: shortUrl(url), url, bold });
      if (trailing) parts.push({ kind: 'text', text: trailing, bold });
    } else {
      parts.push({ kind: 'text', text: stripSymbols(whole), bold });
    }
    last = start + whole.length;
  }
  if (last < text.length) parts.push({ kind: 'text', text: stripSymbols(text.slice(last)), bold });
}

export function discordParts(input: string): TextPart[] {
  const text = String(input ?? '')
    .split('\n')
    .map(cleanLine)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const parts: TextPart[] = [];
  tokenize(text, false, parts);
  // Join neighbouring plain text with the same weight.
  const merged: TextPart[] = [];
  for (const part of parts) {
    const previous = merged[merged.length - 1];
    if (part.kind === 'text' && previous?.kind === 'text' && Boolean(previous.bold) === Boolean(part.bold)) {
      previous.text += part.text;
    } else if (part.kind === 'link' || part.text) {
      merged.push({ ...part });
    }
  }
  return merged.map((part) => (part.bold ? part : stripBoldFlag(part)));
}

function stripBoldFlag(part: TextPart): TextPart {
  const { bold: _bold, ...rest } = part;
  return rest as TextPart;
}
