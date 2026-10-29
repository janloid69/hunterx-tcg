# HunterX Discord bot

Runs on the HunterX 24/7 server and connects the website to the Discord:

- **Market channel:** every new listing is posted with its photo, price, condition, seller and a button to
  message the seller on the website. The post updates when the price changes, shows RESERVED or SOLD, and
  disappears if the listing is removed or hidden by a mod.
- **Vouch channel:** every vouch from a finished deal is posted with its stars and comment.
- **DMs:** members get a DM for new messages (at most one per chat every 10 minutes, and not if they already
  read it), offers, accepted or declined offers, and "you were marked as the buyer, leave a vouch". Members can
  turn these off on their Profile page. Discord only lets the bot DM people who are in the HunterX server.
- **Report tickets:** every report opens a ticket in the mod channel, pings the Support Mod role, and has
  buttons: Resolve, Dismiss, Reopen, Hide or Restore listing. The reporter gets a DM when it's received and when
  a mod has reviewed it. The website's Reports page and the Discord buttons stay in sync.
- **Roles:** Verified Seller (hunterxcircle) and Mod badges on the website update the moment roles change in
  Discord, including when a Circle subscription ends or someone leaves. Everyone is re-checked every 6 hours.
- **Upcoming drops:** the latest posts in #upcoming-drops (text, links, pictures, replies) show on the website's
  Community page for Verified Sellers and mods, within seconds of being posted, edited or deleted. Set
  `DROPS_CHANNEL_ID` (see below).
- **Server events:** upcoming Discord events (pull nights, meetups) are also copied to the database every 15
  minutes, ready to show on the site again later.

It needs only Node.js 22. No `npm install`, no other packages.

## One-time setup

### 1. Supabase

1. **SQL Editor → New query**: paste `supabase/migrations/20261025000000_discord_bot.sql`, click **Run**.
2. **Project Settings → API Keys → Secret keys → New secret key**, name it `discord_bot`, and copy it. It
   starts with `sb_secret_`. It goes only in the bot's `.env` file (step 4), never in a chat or on GitHub.

### 2. Discord Developer Portal

Open <https://discord.com/developers/applications> and pick the HunterX app (the one used for website sign-in).

1. **Bot → Reset Token**, copy the token. Like the secret key, it only goes in `.env`.
2. **Bot → Privileged Gateway Intents**: turn on **Server Members Intent**, then **Save Changes**.
3. **Bot → Public Bot**: turn it off so only you can add it. If Discord won't let you, set
   **Installation → Install Link** to **None** first.
4. Add the bot to the server with this link:
   <https://discord.com/oauth2/authorize?client_id=1563224465158967327&scope=bot&permissions=326417730560&guild_id=1539545293408837697&disable_guild_select=true>

   It asks for: View Channels, Send Messages, Embed Links, Read Message History, Create Public Threads, Send
   Messages in Threads, Manage Threads, and Mention @everyone (only used to ping the Support Mod role on new
   reports; the bot never pings @everyone or @here).

### 3. Channel permissions in Discord

- **#upcoming-drops** (for the website's Upcoming drops): the bot needs View Channel and Read Message History
  there. In the Developer Portal, also turn on **Bot → Privileged Gateway Intents → Message Content Intent**
  (Discord only shares message text with bots that have it), then put the channel's ID in `.env` as
  `DROPS_CHANNEL_ID` and restart the bot.

- **Reports channel** (mod-only): open the channel's settings → Permissions → add the bot. Allow View Channel,
  Send Messages, Embed Links, Create Public Threads, Send Messages in Threads, Manage Threads.
- **Market and vouch channels**: if members can't post there, add the bot and allow Send Messages and Embed
  Links.
- If the reports ID is a **category** instead of a channel, the bot opens a channel per report there and also
  needs **Manage Channels** on that category.

### 4. The server (Windows)

1. Install **Node.js 22 LTS** from <https://nodejs.org> and **Git** from <https://git-scm.com/download/win>
   (defaults are fine).
2. Open **PowerShell** and get the code:

   ```powershell
   cd C:\
   git clone https://github.com/janloid69/hunterx-tcg.git
   cd C:\hunterx-tcg\discord-bot
   copy .env.example .env
   notepad .env
   ```

   In Notepad, paste the bot token after `DISCORD_BOT_TOKEN=` and the Supabase secret key after
   `SUPABASE_SECRET_KEY=`. Everything else is already filled in. Save and close.
3. Try it:

   ```powershell
   node --env-file=.env index.mjs
   ```

   You should see `Signed in to Discord as ...`, `Connected to Supabase`, the three channel names,
   `HunterX bot is running` and a `Role check` line. If something is wrong, the message says how to fix it.
   Press **Ctrl+C** to stop.
4. Make it run all the time, including after restarts. In PowerShell **as Administrator**, in the same folder:

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\install-startup-task.ps1
   ```

## Day to day

- **Logs:** `C:\hunterx-tcg\discord-bot\logs`, one file per day, kept for two weeks.
- **Update** after changes on GitHub:

  ```powershell
  cd C:\hunterx-tcg
  git pull
  powershell -ExecutionPolicy Bypass -File .\discord-bot\restart-bot.ps1
  ```

- **If the bot stops** with a settings problem, it won't keep retrying. Fix `.env` (the log says what's wrong)
  and restart the server, or run `Start-ScheduledTask -TaskName "HunterX Discord bot"`.
- **Turn it off for good:** run `Unregister-ScheduledTask -TaskName "HunterX Discord bot"`, then restart the
  server.

## Optional settings (`.env`)

| Setting | Default | What it does |
|---|---|---|
| `POLL_SECONDS` | 5 | How often to check the website for new activity |
| `DM_COOLDOWN_MINUTES` | 10 | At most one "new message" DM per chat in this time |
| `ROLE_SYNC_HOURS` | 6 | How often to re-check everyone's Discord roles |

## How it works

The website never talks to Discord. Database triggers write each event (new listing, message, vouch, report)
to `bot_outbox`. The bot picks events up every few seconds, does the Discord side, and marks them done. If
Discord or the internet is down, events wait and are retried (up to 10 times, 2 to 60 minutes apart), so
nothing is lost while the server is off. Messages wait a minute first, so nobody gets a DM for a chat they're
reading.

Tests: `npm test` (no database needed). `supabase/tests/run_local.sh` with `POSTGREST_BIN` set also runs the bot
against a real database through PostgREST.
