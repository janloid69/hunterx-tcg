# HunterX TCG

A free website (and later, iPhone and Android apps) where Filipino collectors track
their cards and collectibles in pesos and trade with members of the HunterX Discord.

This is **Phase 1: foundations** — Discord sign-in, the card database, and the binder.

## What's in this repo

| Folder | What it is |
| --- | --- |
| `app/` | The website, built with Expo (React Native). The same code becomes the store apps later. |
| `supabase/migrations/` | The database: tables, security rules, and set progress. |
| `supabase/functions/discord-sync/` | Reads a member's HunterX Discord roles at sign-in and sets their badges. |
| `supabase/tests/` | Checks that the database and its security rules work. |
| `scripts/sync-cards/` | Copies Pokémon, One Piece and Riftbound card data into the database every night. |
| `.github/workflows/` | Automatic checks on every change, and the nightly card sync. |
| `netlify.toml` | Free hosting setup for the website on Netlify. |

### What works in Phase 1

- **Sign in with Discord.** Members with the `hunterxcircle` role get the Verified Seller badge; mods get a Mod badge.
- **Home:** greeting, what's in your binder, quick actions, set progress, recently added.
- **Binder:** set progress for every set you own cards from, filtered by game, plus your toys and sealed products.
- **Set pages:** every card in the set, with owned cards and dashed slots for missing ones. Tap a card to add a copy, change the count, or remove it.
- **Add:** search cards by name or number (`238/191`, `OP01-001`), pick raw or graded, condition, quantity and price paid. Toys and sealed products come from a shared catalog that members add to and mods approve.
- Scan, Market and Community pages are placeholders for later phases.

---

## One-time setup

You need four free accounts: **GitHub**, **Supabase**, **Discord Developer Portal**, and **Netlify**.
Never paste secret keys (Supabase service role / secret key, Discord client secret) into chat or into
the code. They go only where these steps say.

### 1. Create the Discord application

1. Go to <https://discord.com/developers/applications> and click **New Application**. Name it `HunterX TCG`.
2. Open **OAuth2**. Copy the **Client ID**, then click **Reset Secret** and copy the **Client Secret**. Keep both for step 2.
3. Turn on **Developer Mode** in the Discord app: User Settings → Advanced → Developer Mode.
4. Right-click the HunterX server icon → **Copy Server ID**. Save it as `DISCORD_GUILD_ID`.
5. Server Settings → Roles → right-click **hunterxcircle** → **Copy Role ID**. Save it as `DISCORD_CIRCLE_ROLE_ID`.
6. Do the same for your mod role and save it as `DISCORD_MOD_ROLE_ID` (optional).

### 2. Set up Supabase

1. Create a project at <https://supabase.com> (the free plan is enough). Pick the Singapore region for the Philippines.
2. **Create the database:** open **SQL Editor**, paste the whole of
   `supabase/migrations/20261023000000_init.sql`, and click **Run**.
3. **Turn on Discord sign-in:** Authentication → Providers (Sign In / Providers) → **Discord**. Turn it on and paste the
   Client ID and Client Secret from step 1. Copy the **Callback URL** shown there
   (it looks like `https://<project-ref>.supabase.co/auth/v1/callback`).
4. Back in the Discord Developer Portal → **OAuth2** → **Redirects**, add that Callback URL and save.
5. Authentication → **URL Configuration**: set **Site URL** to your website address (your Netlify address
   from step 4, for now `http://localhost:8081`). Under **Redirect URLs**, add both `http://localhost:8081`
   and your Netlify address.
6. **Deploy the role-sync function** (no software needed):
   1. Edge Functions → **Deploy a new function** → **Via Editor**. Name it exactly `discord-sync`.
   2. Replace the sample code with the whole of `supabase/functions/discord-sync/index.ts` and click **Deploy**.
   3. Open the function's **Details** and turn **Verify JWT** off, then save. (The function checks the
      member's sign-in itself.)
   4. Edge Functions → **Secrets**: add `DISCORD_GUILD_ID`, `DISCORD_CIRCLE_ROLE_ID` and
      `DISCORD_MOD_ROLE_ID` with the IDs from step 1.

   Or with the CLI, on a computer with Node.js 22: `npx supabase login`, then
   `npx supabase functions deploy discord-sync --project-ref <your-project-ref> --no-verify-jwt`, then
   `npx supabase secrets set DISCORD_GUILD_ID=… DISCORD_CIRCLE_ROLE_ID=… DISCORD_MOD_ROLE_ID=…`.

7. From **Project Settings → API**, note the **Project URL**, the **anon / publishable key** (safe to share)
   and the **service_role / secret key** (keep private).

### 3. Load the card data (GitHub)

1. In the GitHub repo: **Settings → Secrets and variables → Actions → New repository secret**. Add:
   - `SUPABASE_URL` — the Project URL
   - `SUPABASE_SERVICE_ROLE_KEY` — the service_role / secret key
   - `POKEMONTCG_API_KEY` — optional; a free key from <https://dev.pokemontcg.io> raises the daily limit
2. Open the **Actions** tab → **Sync card data** → **Run workflow**. The first run takes a while (all
   Pokémon sets). After that it runs every night at about 1:47 AM Philippine time.

### 4. Put the website online (Netlify)

1. At <https://app.netlify.com>, choose **Add new site → Import an existing project** and pick this repo.
   The build settings come from `netlify.toml`.
2. No settings to add: the website's public Supabase address and key are in `app/.env.production`.
   (If you ever move to a new Supabase project, update that file.)
3. Deploy. Add the Netlify address (for example `https://hunterx-tcg.netlify.app`) to Supabase's
   Site URL and Redirect URLs (step 2.5). A custom domain can come later.

### Run it on your own computer (optional)

```bash
cd app
cp .env.example .env      # then fill in the Supabase URL and anon key
npm install
npx expo start --web      # opens http://localhost:8081
```

---

## Checks

Every push runs **Checks** on GitHub: it builds the website, applies the database to a fresh Postgres,
runs the security checks (members can't see or edit each other's binders, can't give themselves badges,
etc.), and tests the card sync.

To run the database checks locally (needs Postgres 15+ installed):

```bash
supabase/tests/run_local.sh
```

## Good to know

- **Roles refresh at sign-in.** Discord only shares a member's roles during sign-in, so a new
  hunterxcircle member should sign out and back in to get the badge. The Discord bot (Phase 3) will keep
  roles up to date automatically, including when a monthly subscription ends.
- **One Piece and Riftbound card fields** follow the APIs' published docs, which don't list every field.
  If the first nightly sync reports a problem, check the Actions log; the mappers in
  `scripts/sync-cards/sources/` are written to be easy to adjust.
- **Yu-Gi-Oh!, Gundam and Final Fantasy** are in the database but switched off (`games.enabled = false`)
  until their card data is added.
- **Hiding a game also pauses its nightly sync.** For example, Riftbound is hidden while its card source
  (Riftcodex) blocks GitHub's servers. To bring it back, run
  `update public.games set enabled = true where id = 'riftbound';` in Supabase's SQL Editor.
- **Prices:** peso values come with the price guide in Phase 2. For now the site shows what members
  paid.

## Roadmap

1. **Foundations (this phase):** Discord sign-in, card database sync, binder and set progress.
2. **Scan and prices:** card-number scanner, sales log, peso price guide, collection value.
3. **Market and trust:** listings and offers, chat and vouches, report/block/delete account, the Discord bot.
4. **Website launch:** beta with members, domain and hosting, home-screen install, feedback round.

HunterX TCG is a fan-run community site. It is not affiliated with The Pokémon Company, Bandai, Konami,
Riot Games, Square Enix, Mattel or Takara Tomy.
