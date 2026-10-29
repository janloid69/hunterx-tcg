// Sample rows shaped like what the store reads from Supabase.

export const config = {
  token: 'test-token',
  supabaseUrl: 'https://example.supabase.co',
  secretKey: 'sb_secret_test',
  guildId: '100000000000000001',
  circleRoleId: '200000000000000001',
  modRoleId: '200000000000000002',
  marketChannelId: '300000000000000001',
  vouchChannelId: '300000000000000002',
  reportsChannelId: '300000000000000003',
  siteUrl: 'https://hunterx-tcg.pages.dev',
  pollMs: 5000,
  dmCooldownMs: 10 * 60_000,
  roleSyncMs: 6 * 3_600_000,
};

export const seller = {
  id: 'seller-uuid',
  discord_id: '400000000000000001',
  display_name: 'Kiluwa',
  username: 'kiluwa',
  is_verified_seller: true,
  discord_dms: true,
};

export const buyer = {
  id: 'buyer-uuid',
  discord_id: '400000000000000002',
  display_name: 'Miromozzz',
  username: 'miromozzz',
  is_verified_seller: false,
  discord_dms: true,
};

export const mod = {
  id: 'mod-uuid',
  discord_id: '400000000000000003',
  display_name: 'Mod Mae',
  username: 'modmae',
  is_verified_seller: false,
  discord_dms: true,
};

export function listing(overrides = {}) {
  return {
    id: 'listing-uuid',
    seller_id: seller.id,
    game_id: 'one-piece',
    title: "Shiki (048) · The World's Strongest Warriors OP17-048",
    description: 'Pulled fresh, sleeved right away.',
    kind: 'card',
    condition: 'NM',
    grader: null,
    grade: null,
    price: 500,
    quantity: 1,
    photos: [`${seller.id}/1729-front.jpg`],
    meetup: true,
    meetup_area: 'SM North',
    shipping: true,
    payment_methods: ['GCash', 'Maya'],
    status: 'active',
    sold_price: null,
    sold_at: null,
    buyer_id: null,
    hidden_at: null,
    created_at: '2026-10-24T02:00:00Z',
    seller,
    buyer: null,
    card: { name: 'Shiki', number: 'OP17-048', rarity: 'SR', image_small: 'https://img/s.png', image_large: 'https://img/l.png', set: { name: "The World's Strongest Warriors" } },
    item: null,
    game: { name: 'One Piece' },
    ...overrides,
  };
}

export function report(overrides = {}) {
  return {
    id: 'report-uuid-1234',
    reporter_id: buyer.id,
    listing_id: 'listing-uuid',
    reported_user_id: seller.id,
    message_id: null,
    reason: 'fake',
    details: 'Looks like a proxy',
    snapshot: 'Shiki (048) · ₱500',
    status: 'open',
    handled_by: null,
    handled_at: null,
    created_at: '2026-10-24T03:00:00Z',
    reporter: buyer,
    reported: seller,
    handler: null,
    listing: { id: 'listing-uuid', title: 'Shiki (048)', status: 'active', hidden_at: null },
    message: null,
    ...overrides,
  };
}
