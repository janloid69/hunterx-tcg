// What the bot reads from and writes to the HunterX database. Kept in one
// place so the handlers can be tested with an in-memory stand-in.

const PERSON = 'id, discord_id, display_name, username, avatar_url, is_verified_seller, discord_dms';

const LISTING = [
  '*',
  `seller:profiles!listings_seller_id_fkey(${PERSON})`,
  `buyer:profiles!listings_buyer_id_fkey(${PERSON})`,
  'card:cards(name, number, rarity, image_small, image_large, set:card_sets(name))',
  'item:catalog_items(name, brand, image_url)',
  'game:games(name)',
].join(',');

const MESSAGE = [
  '*',
  'conversation:conversations(id, buyer_id, seller_id, last_message_at, buyer_last_read_at, seller_last_read_at,' +
    ' listing:listings(id, title, price))',
].join(',');

const VOUCH = [
  '*',
  `author:profiles!vouches_author_id_fkey(${PERSON})`,
  `subject:profiles!vouches_subject_id_fkey(${PERSON})`,
  'listing:listings(id, title, price, sold_price, seller_id)',
].join(',');

const REPORT = [
  '*',
  `reporter:profiles!reports_reporter_id_fkey(${PERSON})`,
  `reported:profiles!reports_reported_user_id_fkey(${PERSON})`,
  `handler:profiles!reports_handled_by_fkey(${PERSON})`,
  'listing:listings(id, title, status, hidden_at)',
  'message:messages(id, conversation_id)',
].join(',');

const eq = (value) => `eq.${encodeURIComponent(value)}`;
const compact = (select) => select.replace(/\s+/g, '');

export function createStore(db) {
  return {
    listing: (id) => db.one('listings', `id=${eq(id)}&select=${compact(LISTING)}`),
    memberStats: (id) => db.one('member_stats', `id=${eq(id)}&select=vouch_count,rating_avg,sold_listings`),
    message: (id) => db.one('messages', `id=${eq(id)}&select=${compact(MESSAGE)}`),
    async people(ids) {
      const wanted = [...new Set(ids.filter(Boolean))];
      if (wanted.length === 0) return new Map();
      const rows = await db.select('profiles', `id=in.(${wanted.join(',')})&select=${compact(PERSON)}`);
      return new Map(rows.map((row) => [row.id, row]));
    },
    vouch: (id) => db.one('vouches', `id=${eq(id)}&select=${compact(VOUCH)}`),
    report: (id) => db.one('reports', `id=${eq(id)}&select=${compact(REPORT)}`),

    getPost: (kind, refId) => db.one('bot_discord_posts', `kind=${eq(kind)}&ref_id=${eq(refId)}&select=*`),
    putPost: (kind, refId, fields) =>
      db.upsert('bot_discord_posts', { kind, ref_id: refId, ...fields, updated_at: new Date().toISOString() }, 'kind,ref_id'),
    removePost: (kind, refId) => db.remove('bot_discord_posts', `kind=${eq(kind)}&ref_id=${eq(refId)}`),

    /** Replaces the stored server events with this list. */
    async saveEvents(rows) {
      if (rows.length) await db.upsert('community_events', rows, 'id');
      const keep = rows.map((row) => row.id).filter((id) => /^\d+$/.test(id));
      await db.remove('community_events', keep.length ? `id=not.in.(${keep.join(',')})` : 'id=not.is.null');
    },

    nextEvents: (limit) => db.rpc('bot_next_events', { p_limit: limit }),
    finishEvent: (id, error = null) => db.rpc('bot_finish_event', { p_id: id, p_error: error }),
    cleanup: () => db.rpc('bot_cleanup'),

    syncRoles: ({ members = [], left = [], full = false, circleRoleId, modRoleId }) =>
      db.rpc('bot_sync_roles', {
        p_members: members,
        p_left: left,
        p_full: full,
        p_circle_role: circleRoleId,
        p_mod_role: modRoleId,
      }),
    moderate: (discordId, reportId, action) =>
      db.rpc('bot_moderate', { p_discord_id: discordId, p_report_id: reportId, p_action: action }),
  };
}
