// What the bot does for each event from the website: market posts, vouch
// posts, DMs and report tickets. Every handler reads the latest state, so
// running one twice is harmless.

import { DiscordCodes, DiscordError } from './discord-rest.mjs';
import { memberName, reportReasons } from './format.mjs';
import * as render from './render.mjs';

const SHOWN_IN_MARKET = new Set(['active', 'reserved', 'sold']);

const isGone = (error) => error instanceof DiscordError && error.isGone;

export function createHandlers({ store, discord, config, log = () => {}, reportsMode = 'thread', now = () => Date.now() }) {
  const site = { siteUrl: config.siteUrl, supabaseUrl: config.supabaseUrl };
  const lastChatDm = new Map();

  /** DMs a member unless they turned DMs off. Returns true when sent. */
  async function dmMember(person, payload, what) {
    if (!person?.discord_id || person.discord_dms === false) return false;
    const sent = await discord.dm(person.discord_id, payload);
    if (!sent) log(`Couldn't DM ${memberName(person)} about ${what}: their DMs are closed or they're not in the server`);
    return Boolean(sent);
  }

  async function deleteQuietly(channelId, messageId) {
    if (!channelId || !messageId) return;
    try {
      await discord.deleteMessage(channelId, messageId);
    } catch (error) {
      if (!isGone(error)) throw error;
    }
  }

  // --- Listings -------------------------------------------------------------

  async function listingChanged(id) {
    const listing = await store.listing(id);
    const post = await store.getPost('listing', id);

    if (!listing || listing.hidden_at || !SHOWN_IN_MARKET.has(listing.status)) {
      if (post) {
        await deleteQuietly(post.channel_id, post.message_id);
        await store.removePost('listing', id);
      }
      return;
    }

    const stats = await store.memberStats(listing.seller_id).catch(() => null);
    const payload = render.listingPost(listing, { ...site, stats });
    let onDiscord = false;
    if (post) {
      try {
        await discord.editMessage(post.channel_id, post.message_id, payload);
        await store.putPost('listing', id, { state: listing.status });
        onDiscord = true;
      } catch (error) {
        if (!isGone(error)) throw error;
        log(`The market post for "${listing.title}" was deleted in Discord`);
        await store.removePost('listing', id);
      }
    }
    if (!onDiscord && listing.status === 'active') {
      const message = await discord.sendMessage(config.marketChannelId, payload);
      await store.putPost('listing', id, {
        channel_id: config.marketChannelId,
        message_id: message.id,
        state: listing.status,
      });
      log(`Posted listing "${listing.title}" by ${memberName(listing.seller)}`);
    }

    // Ask the buyer for a vouch, once per sale.
    if (listing.status === 'sold' && listing.buyer) {
      const asked = await store.getPost('dm:sold', id);
      if (asked?.state !== listing.buyer_id) {
        await dmMember(listing.buyer, render.soldToYouDm({ listing, siteUrl: config.siteUrl }), 'a finished deal');
        await store.putPost('dm:sold', id, { state: listing.buyer_id });
      }
    }
  }

  async function listingDeleted(id) {
    const post = await store.getPost('listing', id);
    if (post) {
      await deleteQuietly(post.channel_id, post.message_id);
      await store.removePost('listing', id);
    }
    await store.removePost('dm:sold', id);
  }

  // --- Messages and offers -------------------------------------------------

  async function messageCreated(id) {
    const message = await store.message(id);
    const convo = message?.conversation;
    if (!message || message.kind === 'system' || !convo) return;

    const toBuyer = message.sender_id !== convo.buyer_id;
    const recipientId = toBuyer ? convo.buyer_id : convo.seller_id;
    const lastRead = toBuyer ? convo.buyer_last_read_at : convo.seller_last_read_at;
    if (lastRead && new Date(lastRead) >= new Date(message.created_at)) return; // already read on the site

    // One DM per chat every few minutes is enough; offers always get one.
    const key = `${convo.id}:${recipientId}`;
    if (message.kind !== 'offer' && now() - (lastChatDm.get(key) ?? 0) < config.dmCooldownMs) return;

    const people = await store.people([message.sender_id, recipientId]);
    const payload = render.newMessageDm({
      message,
      sender: people.get(message.sender_id),
      listing: convo.listing,
      conversationId: convo.id,
      siteUrl: config.siteUrl,
    });
    if (await dmMember(people.get(recipientId), payload, 'a new message')) lastChatDm.set(key, now());
  }

  async function offerAnswered(id) {
    const message = await store.message(id);
    const convo = message?.conversation;
    if (!message || message.kind !== 'offer' || !convo) return;
    if (message.offer_status !== 'accepted' && message.offer_status !== 'declined') return;
    if (convo.buyer_last_read_at && convo.last_message_at && new Date(convo.buyer_last_read_at) >= new Date(convo.last_message_at)) {
      return; // the buyer already saw the answer in the chat
    }
    const people = await store.people([message.sender_id, convo.seller_id]);
    await dmMember(
      people.get(message.sender_id),
      render.offerAnsweredDm({
        message,
        seller: people.get(convo.seller_id),
        listing: convo.listing,
        conversationId: convo.id,
        siteUrl: config.siteUrl,
      }),
      'their offer',
    );
  }

  // --- Vouches ---------------------------------------------------------------

  async function vouchCreated(id) {
    if (await store.getPost('vouch', id)) return;
    const vouch = await store.vouch(id);
    if (!vouch) return;
    const message = await discord.sendMessage(config.vouchChannelId, render.vouchPost(vouch, { siteUrl: config.siteUrl }));
    await store.putPost('vouch', id, { channel_id: config.vouchChannelId, message_id: message.id });
    log(`Posted vouch: ${memberName(vouch.author)} → ${memberName(vouch.subject)} (${vouch.rating}★)`);
  }

  async function vouchDeleted(id) {
    const post = await store.getPost('vouch', id);
    if (!post) return;
    await deleteQuietly(post.channel_id, post.message_id);
    await store.removePost('vouch', id);
  }

  // --- Reports ---------------------------------------------------------------

  async function openTicket(report) {
    const name = render.reportThreadName(report);
    const payload = render.reportTicket(report, { siteUrl: config.siteUrl, modRoleId: config.modRoleId, isNew: true });

    if (reportsMode === 'forum') {
      const thread = await discord.createForumPost(config.reportsChannelId, name, payload);
      return { channel_id: thread.id, message_id: thread.message?.id ?? thread.id, thread_id: thread.id };
    }
    if (reportsMode === 'category') {
      const slug = `report-${report.reason}-${String(report.id).slice(0, 6)}`;
      const channel = await discord.createTextChannel(config.guildId, config.reportsChannelId, slug);
      const message = await discord.sendMessage(channel.id, payload);
      return { channel_id: channel.id, message_id: message.id, thread_id: channel.id };
    }
    const message = await discord.sendMessage(config.reportsChannelId, payload);
    let threadId = null;
    try {
      threadId = (await discord.startThread(config.reportsChannelId, message.id, name)).id;
    } catch (error) {
      log(`Couldn't open a thread for report ${String(report.id).slice(0, 8)}: ${error.message}`);
    }
    return { channel_id: config.reportsChannelId, message_id: message.id, thread_id: threadId };
  }

  const usesThreads = reportsMode === 'thread' || reportsMode === 'forum';

  async function setArchived(threadId, archived) {
    if (!threadId || !usesThreads) return;
    try {
      await discord.editChannel(threadId, { archived });
    } catch (error) {
      if (!isGone(error)) throw error;
    }
  }

  async function editTicket(post, payload) {
    try {
      await discord.editMessage(post.channel_id, post.message_id, payload);
    } catch (error) {
      if (error instanceof DiscordError && error.code === DiscordCodes.THREAD_ARCHIVED) {
        await setArchived(post.thread_id, false);
        await discord.editMessage(post.channel_id, post.message_id, payload);
        await setArchived(post.thread_id, true);
        return;
      }
      if (isGone(error)) {
        log(`The ticket for report ${post.ref_id.slice(0, 8)} was deleted in Discord`);
        return;
      }
      throw error;
    }
  }

  async function reportChanged(id, event) {
    const report = await store.report(id);
    if (!report) return; // removed along with its listing or member
    const post = await store.getPost('report', id);

    if (!post) {
      const ticket = await openTicket(report);
      await store.putPost('report', id, { ...ticket, state: report.status });
      log(`Opened a ticket: ${reportReasons[report.reason] ?? report.reason} report about ${memberName(report.reported)}`);
      if (event === 'created') {
        await dmMember(report.reporter, render.reportReceivedDm({ report }), 'their report');
      }
      return;
    }

    await editTicket(post, render.reportTicket(report, { siteUrl: config.siteUrl, modRoleId: config.modRoleId }));
    if (post.state === report.status) return;

    const reopened = report.status === 'open';
    if (post.thread_id) {
      if (reopened) await setArchived(post.thread_id, false);
      try {
        await discord.sendMessage(post.thread_id, render.reportStatusNote(report));
      } catch (error) {
        if (!isGone(error)) throw error;
      }
      if (!reopened) await setArchived(post.thread_id, true);
    }
    if (!reopened && !(await store.getPost('dm:report-closed', id))) {
      await dmMember(report.reporter, render.reportClosedDm({ report }), 'their report');
      await store.putPost('dm:report-closed', id, { state: report.status });
    }
    await store.putPost('report', id, { state: report.status });
  }

  // --- Dispatch --------------------------------------------------------------

  async function handle(event) {
    switch (`${event.kind}:${event.event}`) {
      case 'listing:created':
      case 'listing:updated':
        return listingChanged(event.ref_id);
      case 'listing:deleted':
        return listingDeleted(event.ref_id);
      case 'message:created':
        return messageCreated(event.ref_id);
      case 'offer:updated':
        return offerAnswered(event.ref_id);
      case 'vouch:created':
        return vouchCreated(event.ref_id);
      case 'vouch:deleted':
        return vouchDeleted(event.ref_id);
      case 'report:created':
      case 'report:updated':
        return reportChanged(event.ref_id, event.event);
      default:
        log(`Skipping an event the bot doesn't know: ${event.kind}:${event.event}`);
        return undefined;
    }
  }

  return { handle };
}
