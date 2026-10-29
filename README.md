# HunterX TCG

A free website (and later, iPhone and Android apps) where Filipino collectors track
their cards and collectibles in pesos and trade with members of the HunterX Discord.

Done so far: **Phase 1** (Discord sign-in, card database, binder), **Phase 2** (card scanner and peso price
guide) and **Phase 3** (the marketplace: listings, on-site messages and offers, vouches, reports and blocks,
account deletion, and the Discord bot).

## What's in this repo

| Folder | What it is |
| --- | --- |
| `app/` | The website, built with Expo (React Native). The same code becomes the store apps later. |
| `supabase/migrations/` | The database: tables, security rules, and set progress. |
| `supabase/functions/discord-sync/` | Reads a member's HunterX Discord roles at sign-in and sets their badges. |
| `supabase/tests/` | Checks that the database and its security rules work. |
| `scripts/sync-cards/` | Copies Pokémon, One Piece and Riftbound card data into the database every night. |
| `discord-bot/` | The HunterX Discord bot: market and vouch posts, DMs, report tickets, role sync. Runs on the 24/7 server; setup in its README. |
| `.github/workflows/` | Automatic checks on every change, and the nightly card sync. |
| `netlify.toml` | Free hosting setup for the website on Netlify. |

### What works in Phase 1

- **Sign in with Discord.** Members with the `hunterxcircle` role get the Verified Seller badge; mods get a Mod badge.
- **Home:** greeting, what's in your binder, quick actions, set progress, recently added.
- **Binder:** set progress for every set you own cards from, filtered by game, plus your toys and sealed products.
- **Set pages:** every card in the set, with owned cards and dashed slots for missing ones. Tap a card to add a copy, change the count, or remove it.
- **Add:** search cards by name or number (`238/191`, `OP01-001`), pick raw or graded, condition, quantity and price paid. Toys and sealed products come from a shared catalog that members add to and mods approve.
- **Market:** browse and search listings by game and price. Discord members sell with photos, price, condition,
  meetup or shipping and payment methods, or straight from a card in their binder.
- **Messages:** any signed-in member can chat with a seller on the site (no need to join the Discord). Buyers make
  offers; sellers accept or decline. Live updates, unread counts, safety tips in every chat.
- **Trust:** mark sold (to a member who messaged you), vouches both ways after a sale, member profiles with
  ratings, report a listing, member or message, block, and a Reports page for mods. Three reports from different
  members hide a listing until a mod reviews it.
- **Delete account** from Profile (removes photos, then everything tied to the account).
- **Discord bot:** posts listings and vouches in their channels, DMs members about messages and deals (they can
  turn this off on Profile), opens report tickets with mod buttons, keeps badges in sync with Discord roles, and
  copies #upcoming-drops posts to the Community page.
- **Community:** the latest #upcoming-drops posts from Discord (Verified Sellers and mods only), latest vouches and
  top traders.
- **Mod tools:** reports, plus a review queue for toys and sealed products members add (approve, fix the name,
  merge duplicates, remove junk).
- **House rules and privacy** page, reachable before signing in.
- **Add to home screen:** a web app manifest and icons, so the site opens full screen with its own icon. Home
  and Profile show the steps for the member's phone.
- **Peso price guide:** every card has a **HunterX price** (median of its recent raw Near Mint / Lightly Played
  sales here: marketplace sales plus sales Discord members log from Facebook groups, meetups or shops) and a
  **global price** (TCGplayer or Cardmarket, converted to pesos at the day's rate). Card pages show both, recent
  sales and graded prices; the Price guide page searches cards and lists the latest sales. Listings and the sell
  form show a price check, and the binder shows its estimated value.
- **Sealed prices:** booster boxes, Elite Trainer Boxes, packs, tins and collections for Pokémon, One Piece and
  Riftbound come from TCGCSV (a free daily copy of TCGplayer's catalog and market prices), refreshed weekly by the
  card sync. They show a global price in pesos, and a HunterX price once they sell here (toys too). Search
  understands shorthand like "151 etb".
- **Scanner:** on the Scan page, point the phone camera at the number in the card's bottom corner (`OP01-120`,
  `238/191`, `SSP EN 238/191`). The website reads it on the phone (Tesseract.js, nothing uploaded), finds the
  card, shows its price and adds it to the binder. Bulk mode goes straight back to scanning for a stack of
  cards. There's also "use a photo" and typing the number.

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
2. **Create the database:** open **SQL Editor**, and run each file in `supabase/migrations/` in order, in a new
   query each time: `20261023000000_init.sql`, then `20261024000000_marketplace.sql`, then
   `20261025000000_discord_bot.sql`, then `20261026000000_price_guide.sql`, then `20261027000000_launch.sql`, then
   `20261028000000_sealed_prices.sql`, then `20261029000000_drops.sql`.
   Each should say "Success. No rows returned". The marketplace file also creates the `listing-photos` storage bucket and turns on live chat
   updates.
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
etc.), tests the card sync, and runs the Discord bot against that database through PostgREST (what
Supabase uses) with Discord faked.

To run the database checks locally (needs Postgres 15+ installed):

```bash
supabase/tests/run_local.sh
```

## Good to know

- **Roles stay in sync.** Badges are set at sign-in, and the Discord bot updates them the moment roles change
  in Discord (including when a monthly Circle subscription ends). If the bot is off, signing out and back in
  refreshes them.
- **One Piece and Riftbound card fields** follow the APIs' published docs, which don't list every field.
  If the first nightly sync reports a problem, check the Actions log; the mappers in
  `scripts/sync-cards/sources/` are written to be easy to adjust.
- **Yu-Gi-Oh!, Gundam and Final Fantasy** are in the database but switched off (`games.enabled = false`)
  until their card data is added.
- **Hiding a game also pauses its nightly sync.** For example, Riftbound is hidden while its card source
  (Riftcodex) blocks GitHub's servers. To bring it back, run
  `update public.games set enabled = true where id = 'riftbound';` in Supabase's SQL Editor.
- **Prices refresh nightly.** One Piece prices update every night. Pokémon re-downloads every set once a week
  (Sunday morning in the Philippines; it can take two hours or more because the Pokémon API is slow) to
  refresh older sets' prices; recent sets update nightly. The run's summary page shows how many cards got a
  global price and the day's exchange rates. To refresh
  everything now, run **Sync card data** from the Actions tab with "Re-download every Pokémon set" ticked.
- **Global prices are a reference.** They're US/EU online prices converted to pesos; local prices can be very
  different, which is why the HunterX price comes first whenever a card has sold here.

## Roadmap

1. **Foundations (done):** Discord sign-in, card database sync, binder and set progress.
2. **Scan and prices (done):** card-number scanner, sales log, peso price guide, collection value.
3. **Market and trust (done):** listings and offers, chat and vouches, report/block/delete account, the Discord bot.
4. **Website launch:** beta with members, domain and hosting, home-screen install, feedback round.

HunterX TCG is a fan-run community site. It is not affiliated with The Pokémon Company, Bandai, Konami,
Riot Games, Square Enix, Mattel or Takara Tomy.
