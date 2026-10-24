// What the bot's Discord messages look like. Pure functions: data in,
// Discord message payload out, so they're easy to test and tweak.

import {
  conditionLabels,
  discordTime,
  escapeMarkdown,
  kindLabels,
  memberName,
  mention,
  peso,
  quote,
  reportReasons,
  stars,
  truncate,
} from './format.mjs';

export const Colors = {
  orange: 0xff6b1a,
  gold: 0xf2c94c,
  green: 0x5bd68a,
  grey: 0x5c5c66,
};

const ButtonStyle = { PRIMARY: 1, SECONDARY: 2, SUCCESS: 3, DANGER: 4, LINK: 5 };
const row = (...components) => ({ type: 1, components: components.filter(Boolean) });
const linkButton = (label, url) => ({ type: 2, style: ButtonStyle.LINK, label, url });
const button = (label, customId, style) => ({ type: 2, style, label, custom_id: customId });

const CHAT_FOOTER = '\n-# Reply on the HunterX website. You can turn these DMs off in your HunterX profile.';
const SETTINGS_FOOTER = '\n-# You can turn these DMs off in your HunterX profile.';

export const listingUrl = (siteUrl, id) => `${siteUrl}/market/${id}`;
export const chatUrl = (siteUrl, id) => `${siteUrl}/messages/${id}`;

export function photoUrl(supabaseUrl, path) {
  return `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/listing-photos/${path.split('/').map(encodeURIComponent).join('/')}`;
}

function listingImage(listing, supabaseUrl) {
  if (listing.photos?.length) return photoUrl(supabaseUrl, listing.photos[0]);
  return listing.card?.image_large || listing.card?.image_small || listing.item?.image_url || null;
}

function conditionText(listing) {
  if (listing.kind === 'graded') return [listing.grader, listing.grade].filter(Boolean).join(' ') || kindLabels.graded;
  if (listing.condition) return conditionLabels[listing.condition] ?? listing.condition;
  return kindLabels[listing.kind] ?? 'Not stated';
}

function sellerLine(seller, stats) {
  const parts = [mention(seller)];
  if (seller?.is_verified_seller) parts.push('✅ Verified Seller');
  if (stats?.vouch_count > 0) {
    parts.push(`★ ${Number(stats.rating_avg).toFixed(1)} (${stats.vouch_count} vouch${stats.vouch_count === 1 ? '' : 'es'})`);
  }
  return parts.join(' · ');
}

/** The market channel post for a listing. Changes with its status. */
export function listingPost(listing, { siteUrl, supabaseUrl, stats = null }) {
  const url = listingUrl(siteUrl, listing.id);
  const sold = listing.status === 'sold';
  const reserved = listing.status === 'reserved';
  const prefix = sold ? 'SOLD · ' : reserved ? 'RESERVED · ' : '';

  let price = peso(listing.price);
  if (sold) price = `~~${price}~~ Sold`;
  else if (listing.quantity > 1) price = `${price} each · ${listing.quantity} available`;

  const fields = [
    { name: 'Price', value: price, inline: true },
    { name: listing.kind === 'graded' ? 'Grade' : 'Condition', value: conditionText(listing), inline: true },
  ];
  if (listing.game?.name) fields.push({ name: 'Game', value: listing.game.name, inline: true });
  if (listing.card) {
    const card = [listing.card.set?.name, listing.card.number ? `#${listing.card.number}` : null, listing.card.rarity]
      .filter(Boolean)
      .join(' · ');
    if (card) fields.push({ name: 'Card', value: truncate(card, 1024) });
  }
  fields.push({ name: 'Seller', value: truncate(sellerLine(listing.seller, stats), 1024) });

  const delivery = [
    listing.meetup ? `Meetup${listing.meetup_area ? `: ${escapeMarkdown(listing.meetup_area)}` : ''}` : null,
    listing.shipping ? 'Shipping' : null,
  ].filter(Boolean);
  if (delivery.length) fields.push({ name: 'Delivery', value: delivery.join(' · '), inline: true });
  if (listing.payment_methods?.length) {
    fields.push({ name: 'Payment', value: listing.payment_methods.join(', '), inline: true });
  }

  const image = listingImage(listing, supabaseUrl);
  return {
    embeds: [
      {
        title: truncate(prefix + listing.title, 256),
        url,
        color: sold ? Colors.grey : reserved ? Colors.gold : Colors.orange,
        description: listing.description ? truncate(escapeMarkdown(listing.description), 350) : undefined,
        fields,
        image: image ? { url: image } : undefined,
        footer: { text: sold ? 'HunterX Market · Sold' : 'HunterX Market · Message the seller on the website' },
        timestamp: listing.created_at,
      },
    ],
    components: [row(linkButton(listing.status === 'active' ? 'View and message seller' : 'View listing', url))],
  };
}

/** The vouch channel post. */
export function vouchPost(vouch, { siteUrl }) {
  const listing = vouch.listing;
  const authorWasSeller = listing && vouch.author_id === listing.seller_id;
  const lines = [
    `${mention(vouch.author)} (${authorWasSeller ? 'seller' : 'buyer'}) vouched for ${mention(vouch.subject)} (${authorWasSeller ? 'buyer' : 'seller'})`,
    `**${stars(vouch.rating)}**`,
  ];
  if (vouch.comment) lines.push(quote(escapeMarkdown(truncate(vouch.comment, 500))));
  if (listing) {
    const amount = listing.sold_price ?? listing.price;
    lines.push(`Deal: [${escapeMarkdown(truncate(listing.title, 120))}](${listingUrl(siteUrl, listing.id)})${amount ? ` · ${peso(amount)}` : ''}`);
  }
  return {
    embeds: [
      {
        color: Colors.gold,
        description: truncate(lines.join('\n'), 4096),
        footer: { text: 'HunterX vouches · from a finished deal on the website' },
        timestamp: vouch.created_at,
      },
    ],
  };
}

function reportStatusText(report) {
  const who = report.handler ? mention(report.handler) : 'a mod';
  const when = report.handled_at ? ` ${discordTime(report.handled_at)}` : '';
  if (report.status === 'resolved') return `✅ Resolved by ${who}${when}`;
  if (report.status === 'dismissed') return `Dismissed by ${who}${when}`;
  return '🟠 Open · please reply within 24 hours';
}

function reportTarget(report, siteUrl) {
  if (report.listing) {
    const hidden = report.listing.hidden_at ? ' · **hidden from the Market**' : '';
    return `Listing: [${escapeMarkdown(truncate(report.listing.title, 150))}](${listingUrl(siteUrl, report.listing.id)})${hidden}`;
  }
  if (report.message_id) return 'A message in a chat';
  return 'A member';
}

export const reportThreadName = (report) =>
  truncate(`${reportReasons[report.reason] ?? 'Report'} · ${memberName(report.reported)}`, 90);

/** The ticket mods see for a report, with buttons to handle it. */
export function reportTicket(report, { siteUrl, modRoleId, isNew = false }) {
  const fields = [
    { name: 'Reported member', value: report.reported ? mention(report.reported) : 'Unknown', inline: true },
    { name: 'Reported by', value: mention(report.reporter), inline: true },
    { name: 'About', value: reportTarget(report, siteUrl) },
  ];
  if (report.snapshot) fields.push({ name: 'What they saw', value: truncate(quote(escapeMarkdown(report.snapshot)), 1024) });
  if (report.details) fields.push({ name: 'Reporter’s note', value: truncate(escapeMarkdown(report.details), 1024) });
  fields.push({ name: 'Status', value: reportStatusText(report) });

  const id = report.id;
  const open = report.status === 'open';
  const actions = row(
    open ? button('Resolve', `hx:report:resolve:${id}`, ButtonStyle.SUCCESS) : null,
    open ? button('Dismiss', `hx:report:dismiss:${id}`, ButtonStyle.SECONDARY) : null,
    open ? null : button('Reopen', `hx:report:reopen:${id}`, ButtonStyle.SECONDARY),
    report.listing
      ? report.listing.hidden_at
        ? button('Restore listing', `hx:report:restore:${id}`, ButtonStyle.SECONDARY)
        : button('Hide listing', `hx:report:hide:${id}`, ButtonStyle.DANGER)
      : null,
    linkButton('Reports page', `${siteUrl}/mod`),
  );

  const payload = {
    embeds: [
      {
        title: `Report: ${reportReasons[report.reason] ?? report.reason}`,
        color: open ? Colors.orange : report.status === 'resolved' ? Colors.green : Colors.grey,
        fields,
        footer: { text: `Report ${String(id).slice(0, 8)} · HunterX` },
        timestamp: report.created_at,
      },
    ],
    components: [actions],
  };
  if (isNew && modRoleId) {
    payload.content = `<@&${modRoleId}> New report. A mod should reply within 24 hours.`;
    payload.allowed_mentions = { parse: [], roles: [modRoleId] };
  }
  return payload;
}

/** One line for the ticket thread when a report changes status. */
export function reportStatusNote(report) {
  const who = report.handler ? mention(report.handler) : 'A mod';
  if (report.status === 'resolved') return { content: `✅ ${who} marked this report resolved.` };
  if (report.status === 'dismissed') return { content: `${who} dismissed this report.` };
  return { content: `${who} reopened this report.` };
}

// --- DMs -----------------------------------------------------------------

export function newMessageDm({ message, sender, listing, conversationId, siteUrl }) {
  const name = escapeMarkdown(memberName(sender));
  const title = escapeMarkdown(truncate(listing?.title ?? 'your listing', 120));
  let text;
  if (message.kind === 'offer') {
    text = `💸 **${name}** offered **${peso(message.offer_amount)}** for **${title}**`;
    if (listing?.price) text += ` (listed at ${peso(listing.price)})`;
    text += '.';
    if (message.body) text += `\n${quote(escapeMarkdown(truncate(message.body, 300)))}`;
  } else {
    text = `💬 **${name}** sent you a message about **${title}**:\n${quote(escapeMarkdown(truncate(message.body, 300)))}`;
  }
  return {
    content: truncate(text, 1800) + CHAT_FOOTER,
    components: [row(linkButton('Open chat', chatUrl(siteUrl, conversationId)))],
  };
}

export function offerAnsweredDm({ message, seller, listing, conversationId, siteUrl }) {
  const name = escapeMarkdown(memberName(seller));
  const title = escapeMarkdown(truncate(listing?.title ?? 'the listing', 120));
  const amount = peso(message.offer_amount);
  const text =
    message.offer_status === 'accepted'
      ? `✅ **${name}** accepted your **${amount}** offer for **${title}**. Agree on payment and meetup or shipping in the chat.`
      : `**${name}** declined your **${amount}** offer for **${title}**.`;
  return {
    content: text + CHAT_FOOTER,
    components: [row(linkButton('Open chat', chatUrl(siteUrl, conversationId)))],
  };
}

export function soldToYouDm({ listing, siteUrl }) {
  const name = escapeMarkdown(memberName(listing.seller));
  const title = escapeMarkdown(truncate(listing.title, 120));
  return {
    content:
      `🤝 **${name}** marked **${title}** as sold to you. ` +
      'Leave a vouch so other collectors know how the deal went.' +
      SETTINGS_FOOTER,
    components: [row(linkButton('Leave a vouch', listingUrl(siteUrl, listing.id)))],
  };
}

function reportAbout(report) {
  if (report.listing?.title) return ` about **${escapeMarkdown(truncate(report.listing.title, 120))}**`;
  if (report.reported) return ` about **${escapeMarkdown(memberName(report.reported))}**`;
  return '';
}

export function reportReceivedDm({ report }) {
  return {
    content:
      `🛡️ Thanks for your report${reportAbout(report)}. A HunterX mod will look into it within 24 hours. ` +
      'The member you reported isn’t told who reported them.' +
      SETTINGS_FOOTER,
  };
}

export function reportClosedDm({ report }) {
  return {
    content: `🛡️ A HunterX mod reviewed your report${reportAbout(report)}. Thanks for helping keep HunterX safe.` + SETTINGS_FOOTER,
  };
}
