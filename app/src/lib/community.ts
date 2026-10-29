// Community page data: #upcoming-drops posts and server events from Discord,
// latest vouches, top traders.

import { supabase } from './supabase';
import type { MemberSummary } from './types';

export type CommunityEvent = {
  id: string;
  name: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  image_url: string | null;
  interested: number | null;
  status: 'scheduled' | 'active';
  url: string;
};

export type DropAttachment = {
  url: string;
  kind: 'image' | 'video' | 'file';
  name: string | null;
  width: number | null;
  height: number | null;
};

/** A post from the server's #upcoming-drops channel, copied in by the HunterX bot. */
export type CommunityDrop = {
  id: string;
  author_name: string;
  author_avatar: string | null;
  content: string;
  attachments: DropAttachment[];
  reply: { author: string; content: string } | null;
  posted_at: string;
  edited_at: string | null;
  url: string;
};

type Person = Pick<MemberSummary, 'id' | 'display_name' | 'username' | 'avatar_url'>;

export type VouchFeedItem = {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  author: Person | null;
  subject: Person | null;
};

export type TopTrader = {
  member: MemberSummary;
  vouch_count: number;
  rating_avg: number | null;
  sold_listings: number;
};

const MEMBER_FIELDS = 'id, display_name, username, avatar_url, is_verified_seller, is_mod, in_guild, created_at';

export async function getUpcomingEvents(): Promise<CommunityEvent[]> {
  const { data, error } = await supabase.from('community_events').select('*').order('starts_at').limit(10);
  if (error) throw error;
  return (data ?? []) as CommunityEvent[];
}

/** Newest #upcoming-drops posts. Empty until the drops migration has run. */
export async function getLatestDrops(limit = 10): Promise<CommunityDrop[]> {
  const { data, error } = await supabase
    .from('community_drops')
    .select('id, author_name, author_avatar, content, attachments, reply, posted_at, edited_at, url')
    .order('posted_at', { ascending: false })
    .limit(limit);
  if (error) {
    // The table arrives with supabase/migrations/20261029000000_drops.sql.
    if (error.code === 'PGRST205' || error.code === '42P01') return [];
    throw error;
  }
  return ((data ?? []) as CommunityDrop[]).map((drop) => ({ ...drop, attachments: Array.isArray(drop.attachments) ? drop.attachments : [] }));
}

/** The Discord channel a post is in: https://discord.com/channels/<server>/<channel> */
export function dropChannelUrl(drop: Pick<CommunityDrop, 'url'>): string {
  return drop.url.replace(/\/\d+$/, '');
}

export async function getLatestVouches(limit = 8): Promise<VouchFeedItem[]> {
  const { data, error } = await supabase
    .from('vouches')
    .select(
      `id, rating, comment, created_at,
       author:profiles!vouches_author_id_fkey ( id, display_name, username, avatar_url ),
       subject:profiles!vouches_subject_id_fkey ( id, display_name, username, avatar_url )`,
    )
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as VouchFeedItem[];
}

/** Members with the most vouches. */
export async function getTopTraders(limit = 10): Promise<TopTrader[]> {
  const { data: stats, error } = await supabase
    .from('member_stats')
    .select('id, vouch_count, rating_avg, sold_listings')
    .gt('vouch_count', 0)
    .order('vouch_count', { ascending: false })
    .order('rating_avg', { ascending: false })
    .limit(limit);
  if (error) throw error;
  const rows = (stats ?? []) as { id: string; vouch_count: number; rating_avg: number | null; sold_listings: number }[];
  if (rows.length === 0) return [];
  const { data: people, error: peopleError } = await supabase
    .from('profiles')
    .select(MEMBER_FIELDS)
    .in('id', rows.map((row) => row.id));
  if (peopleError) throw peopleError;
  const byId = new Map(((people ?? []) as MemberSummary[]).map((person) => [person.id, person]));
  return rows
    .filter((row) => byId.has(row.id))
    .map((row) => ({
      member: byId.get(row.id)!,
      vouch_count: row.vouch_count,
      rating_avg: row.rating_avg === null ? null : Number(row.rating_avg),
      sold_listings: row.sold_listings,
    }));
}

/** "Sat, Nov 1 · 8:00 PM" in Philippine time. */
export function eventTime(iso: string): string {
  const date = new Date(iso);
  const day = date.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'Asia/Manila' });
  const time = date.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' });
  return `${day} · ${time}`;
}
