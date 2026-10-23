// discord-sync: reads the signed-in member's roles in the HunterX Discord and
// saves their badges (Verified Seller, Mod) on their profile.
//
// The app calls this right after "Sign in with Discord", passing the Discord
// access token Supabase hands back for that sign-in. Badges are written with
// the service role, so members can never set them on their own.
//
// Secrets to set (supabase secrets set NAME=value):
//   DISCORD_GUILD_ID         HunterX server ID
//   DISCORD_CIRCLE_ROLE_ID   ID of the hunterxcircle role (Verified Seller)
//   DISCORD_MOD_ROLE_ID      ID of the mod role (optional)
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided
// by Supabase automatically.

import { createClient } from 'npm:@supabase/supabase-js@2';

const DISCORD_API = 'https://discord.com/api/v10';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** Returns the first secret that is set, so both old and new Supabase key names work. */
function requireEnv(...names: string[]): string {
  for (const name of names) {
    const value = Deno.env.get(name);
    if (value) return value;
  }
  throw new Error(`Missing secret ${names.join(' or ')}`);
}

type DiscordMember = { roles?: string[] };
type DiscordUser = { id: string; username?: string; global_name?: string | null; avatar?: string | null };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);

  try {
    const supabaseUrl = requireEnv('SUPABASE_URL');
    const anonKey = requireEnv('SUPABASE_ANON_KEY', 'SUPABASE_PUBLISHABLE_KEY');
    const serviceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY');
    const guildId = requireEnv('DISCORD_GUILD_ID');
    const circleRoleId = requireEnv('DISCORD_CIRCLE_ROLE_ID');
    const modRoleId = Deno.env.get('DISCORD_MOD_ROLE_ID') ?? '';

    // 1. Who is calling? Verify their Supabase session token. The function is
    //    deployed with JWT checks off at the gateway, so this check is the gate.
    const accessToken = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!accessToken) return json({ error: 'Not signed in' }, 401);
    const asCaller = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
    const { data: userData, error: userError } = await asCaller.auth.getUser(accessToken);
    if (userError || !userData.user) return json({ error: 'Not signed in' }, 401);
    const user = userData.user;

    const body = await req.json().catch(() => ({}));
    const providerToken = typeof body?.providerToken === 'string' ? body.providerToken : '';
    if (!providerToken) return json({ error: 'Missing Discord token' }, 400);

    // 2. Make sure the Discord token belongs to the same Discord account.
    const meRes = await fetch(`${DISCORD_API}/users/@me`, {
      headers: { Authorization: `Bearer ${providerToken}` },
    });
    if (!meRes.ok) return json({ error: 'Discord did not accept the sign-in token' }, 401);
    const me = (await meRes.json()) as DiscordUser;
    const linkedDiscordId = user.user_metadata?.provider_id ?? user.user_metadata?.sub;
    if (linkedDiscordId && linkedDiscordId !== me.id) {
      return json({ error: 'Discord account does not match this sign-in' }, 403);
    }

    // 3. Read their membership and roles in the HunterX server.
    const memberRes = await fetch(`${DISCORD_API}/users/@me/guilds/${guildId}/member`, {
      headers: { Authorization: `Bearer ${providerToken}` },
    });
    let inGuild = false;
    let roles: string[] = [];
    if (memberRes.ok) {
      inGuild = true;
      roles = ((await memberRes.json()) as DiscordMember).roles ?? [];
    } else if (memberRes.status !== 404) {
      // 404 means "not in the server". Anything else (e.g. rate limit) is a real error.
      return json({ error: `Discord returned ${memberRes.status} for server membership` }, 502);
    }

    const avatarUrl = me.avatar
      ? `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png?size=128`
      : null;

    const profile = {
      discord_id: me.id,
      username: me.username ?? null,
      display_name: me.global_name ?? me.username ?? null,
      avatar_url: avatarUrl,
      in_guild: inGuild,
      is_verified_seller: inGuild && roles.includes(circleRoleId),
      is_mod: inGuild && modRoleId !== '' && roles.includes(modRoleId),
      roles_synced_at: new Date().toISOString(),
    };

    // 4. Save with the service role (members cannot write badges themselves).
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { data: saved, error: saveError } = await admin
      .from('profiles')
      .update(profile)
      .eq('id', user.id)
      .select()
      .single();
    if (saveError) return json({ error: saveError.message }, 500);

    return json({ profile: saved });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unexpected error' }, 500);
  }
});
