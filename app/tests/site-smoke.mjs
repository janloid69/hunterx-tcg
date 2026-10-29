// Opens the built website in Chrome and checks the pages every visitor hits
// first: signed out, a stuck font download, and signed in.
//
//   node tests/site-smoke.mjs dist
//
// PLAYWRIGHT_MODULE: path to playwright-core's index.mjs (default: "playwright")
// CHROME_CHANNEL: "chrome" to use the installed Google Chrome

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const dist = path.resolve(process.argv[2] ?? 'dist');
const playwrightModule = process.env.PLAYWRIGHT_MODULE;
const { chromium } = await import(playwrightModule ? pathToFileURL(playwrightModule).href : 'playwright');

const SIGN_IN = 'Sign in with Discord';
const RULES = 'HOUSE RULES & PRIVACY';
const WAIT = 20_000;

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

// Like Netlify: real files as they are, every other path gets index.html.
async function serve(req, res) {
  const pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = path.join(dist, pathname);
  if (!file.startsWith(dist)) file = path.join(dist, 'index.html');
  try {
    if (!(await stat(file)).isFile()) throw new Error('not a file');
  } catch {
    file = path.join(dist, 'index.html');
  }
  res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' });
  res.end(await readFile(file));
}

const server = createServer((req, res) => {
  serve(req, res).catch((error) => {
    res.writeHead(500);
    res.end(String(error));
  });
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const site = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch(process.env.CHROME_CHANNEL ? { channel: process.env.CHROME_CHANNEL } : {});
let failures = 0;

async function check(name, run) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  // The build points at a placeholder Supabase project; answer instantly instead of waiting on DNS.
  await context.route(/supabase\.co/, (route) => route.abort());
  context.setDefaultTimeout(WAIT);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await run(page, context);
    console.log(`ok - ${name}`);
  } catch (error) {
    failures += 1;
    const detail = `${error.message.split('\n')[0]} (at ${page.url()})${errors.length ? ` page errors: ${errors.join(' | ')}` : ''}`;
    console.log(`not ok - ${name}: ${detail}`);
    if (process.env.GITHUB_ACTIONS) console.log(`::error title=Website smoke test::${name}: ${detail}`);
  } finally {
    await context.close();
  }
}

const visible = (page, text) =>
  page.getByText(text, { exact: true }).filter({ visible: true }).first().waitFor({ state: 'visible', timeout: WAIT });
const pathOf = (page) => new URL(page.url()).pathname;
function expectPath(page, expected) {
  if (pathOf(page) !== expected) throw new Error(`expected to be on ${expected}, but on ${pathOf(page)}`);
}

await check('the page itself sets up the home-screen app and dark background', async () => {
  const html = await (await fetch(`${site}/`)).text();
  for (const needle of [
    'rel="manifest"',
    'name="apple-mobile-web-app-capable"',
    'name="apple-mobile-web-app-status-bar-style"',
    'rel="apple-touch-icon"',
    'viewport-fit=cover',
    'property="og:image"',
    'name="twitter:card"',
    '#0E0E10',
    '<script src=',
  ]) {
    if (!html.includes(needle)) throw new Error(`index.html is missing ${needle}`);
  }
});

await check('signed out, the home page goes to sign-in', async (page) => {
  await page.goto(`${site}/`);
  await visible(page, SIGN_IN);
  expectPath(page, '/sign-in');
});

await check('signed out, a member page goes to sign-in', async (page) => {
  await page.goto(`${site}/profile`);
  await visible(page, SIGN_IN);
  expectPath(page, '/sign-in');
});

await check('signed out, Back on House rules (opened directly) goes to sign-in', async (page) => {
  await page.goto(`${site}/rules`);
  await visible(page, RULES);
  await page.getByText('Back', { exact: true }).first().click();
  await visible(page, SIGN_IN);
  expectPath(page, '/sign-in');
});

await check('signed out, House rules from the sign-in page and Back again', async (page) => {
  await page.goto(`${site}/sign-in`);
  await visible(page, SIGN_IN);
  await page.getByText('House rules and privacy').first().click();
  await visible(page, RULES);
  await page.getByText('Back', { exact: true }).last().click();
  await visible(page, SIGN_IN);
  expectPath(page, '/sign-in');
});

await check('the site shows within 6 seconds even if the font files never arrive', async (page, context) => {
  // Leave font requests hanging, like the iPhone home-screen app that never
  // reported its fonts as loaded.
  await context.route(/\.(ttf|otf|woff2?)(\?|$)/, () => {});
  const started = Date.now();
  await page.goto(`${site}/`, { waitUntil: 'commit' });
  await visible(page, SIGN_IN);
  const seconds = (Date.now() - started) / 1000;
  if (seconds > 6) throw new Error(`took ${seconds.toFixed(1)} s`);
});

// A made-up session that looks valid to supabase-js until it expires in an hour.
const base64url = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const expiresAt = Math.floor(Date.now() / 1000) + 3600;
const userId = '00000000-0000-4000-8000-000000000001';
const fakeSession = {
  access_token: `${base64url({ alg: 'HS256', typ: 'JWT' })}.${base64url({ sub: userId, role: 'authenticated', exp: expiresAt })}.c2ln`,
  refresh_token: 'smoke-test',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: expiresAt,
  user: { id: userId, aud: 'authenticated', role: 'authenticated', email: 'smoke@example.com', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
};
async function signIn(context) {
  await context.addInitScript((session) => {
    localStorage.setItem('sb-example-auth-token', session);
  }, JSON.stringify(fakeSession));
}

await check('signed in, the sign-in page goes to Home', async (page, context) => {
  await signIn(context);
  await page.goto(`${site}/sign-in`);
  await visible(page, 'Community');
  expectPath(page, '/');
});

await check('signed in, House rules has the tabs and Back goes to Home', async (page, context) => {
  await signIn(context);
  await page.goto(`${site}/rules`);
  await visible(page, RULES);
  await visible(page, 'Community');
  await page.getByText('Back', { exact: true }).first().click();
  await page.waitForURL((url) => url.pathname === '/', { timeout: WAIT });
});

await check('signed in but not in the Discord, Sell asks them to join; "I’ve joined" unlocks it', async (page, context) => {
  await signIn(context);
  let inGuild = false;
  await context.route(/\/rest\/v1\/profiles/, (route) => {
    const profile = {
      id: userId,
      discord_id: '500000000000000099',
      username: 'smoke',
      display_name: 'Smoke Test',
      avatar_url: null,
      in_guild: inGuild,
      is_verified_seller: false,
      is_mod: false,
      discord_dms: true,
      created_at: new Date().toISOString(),
    };
    const single = (route.request().headers().accept ?? '').includes('vnd.pgrst.object');
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(single ? profile : [profile]) });
  });
  await page.goto(`${site}/market/new`);
  await visible(page, 'Want to be a seller? Join the HunterX Discord!');
  // The bot marks them as a member after they join the server.
  inGuild = true;
  await page.getByText('I’ve joined', { exact: true }).click();
  await page
    .getByText('Want to be a seller? Join the HunterX Discord!', { exact: true })
    .waitFor({ state: 'detached', timeout: WAIT });
});

await check('binder: tap a toy, then remove it', async (page, context) => {
  await signIn(context);
  let removed = false;
  const toy = {
    id: 'aaaaaaaa-0000-4000-8000-000000000001',
    card_id: null,
    catalog_item_id: 'bbbbbbbb-0000-4000-8000-000000000001',
    kind: 'item',
    quantity: 2,
    condition: 'NM',
    grader: null,
    grade: null,
    price_paid: null,
    created_at: new Date().toISOString(),
    card: null,
    item: { id: 'bbbbbbbb-0000-4000-8000-000000000001', name: 'Smoke Test Porsche 930', brand: 'Hot Wheels', line: 'Red Line Club', game_id: 'toys', kind: 'toy', image_url: null },
  };
  await context.route(/\/rest\/v1\/collection_items/, (route) => {
    const method = route.request().method();
    if (method === 'DELETE') {
      removed = true;
      return route.fulfill({ status: 204, body: '' });
    }
    if (method !== 'GET') return route.fulfill({ status: 204, body: '' });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(removed ? [] : [toy]) });
  });
  await page.goto(`${site}/binder`);
  await visible(page, 'Smoke Test Porsche 930');
  await page.getByText('Smoke Test Porsche 930', { exact: true }).first().click();
  await visible(page, 'How many you have');
  await page.getByText('Remove from binder', { exact: true }).click();
  await page.getByText('Remove', { exact: true }).click();
  await page.getByText('Smoke Test Porsche 930', { exact: true }).first().waitFor({ state: 'detached', timeout: WAIT });
  if (!removed) throw new Error('no delete request was sent');
});

await check('signing out asks first, and Cancel keeps you signed in', async (page, context) => {
  await signIn(context);
  await page.goto(`${site}/profile`);
  await page.getByText('Sign out', { exact: true }).first().click();
  await visible(page, 'Sign out of HunterX?');
  await page.getByText('Cancel', { exact: true }).click();
  await page.getByText('Sign out of HunterX?', { exact: true }).waitFor({ state: 'hidden', timeout: WAIT });
  expectPath(page, '/profile');
  await page.getByText('Sign out', { exact: true }).first().click();
  await visible(page, 'Sign out of HunterX?');
  await page.getByText('Sign out', { exact: true }).last().click();
  await visible(page, SIGN_IN);
  expectPath(page, '/sign-in');
});

await check('sealed search: "151 etb" finds the Elite Trainer Box and shows its peso price', async (page, context) => {
  await signIn(context);
  const etbId = 'eeeeeeee-0000-4000-8000-000000000151';
  const searches = [];
  await context.route(/\/rest\/v1\/catalog_items/, (route) => {
    searches.push(decodeURIComponent(route.request().url()));
    const etb = { id: etbId, game_id: 'pokemon', kind: 'sealed', name: 'Scarlet & Violet 151 Elite Trainer Box', brand: 'Pokémon', line: 'SV: Scarlet & Violet 151', image_url: null, status: 'approved' };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([etb]) });
  });
  await context.route(/\/rest\/v1\/catalog_prices/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{
        catalog_item_id: etbId, local_php: null, local_sales: 0, local_low: null, local_high: null, last_sold_php: null,
        last_sold_at: null, global_php: 5219, global_source: 'TCGplayer', global_updated_at: new Date().toISOString(), value_php: 5219,
      }]),
    }),
  );
  await page.goto(`${site}/add?tab=other`);
  await page.getByText('Sealed product', { exact: true }).click();
  await page.getByPlaceholder('e.g. Surging Sparks booster box').fill('151 etb');
  await visible(page, 'Scarlet & Violet 151 Elite Trainer Box');
  await visible(page, 'Global ≈ ₱5,219');
  const last = searches.at(-1) ?? '';
  for (const word of ['151', 'elite', 'trainer', 'box', 'kind=eq.sealed']) {
    if (!last.includes(word)) throw new Error(`search didn't look for ${word}: ${last}`);
  }
});

// Answers the signed-in member's profile request.
async function routeProfile(context, fields) {
  await context.route(/\/rest\/v1\/profiles/, (route) => {
    const profile = {
      id: userId, discord_id: '500000000000000099', username: 'smoke', display_name: 'Smoke Test', avatar_url: null,
      in_guild: true, is_verified_seller: false, is_mod: false, discord_dms: true, created_at: new Date().toISOString(), ...fields,
    };
    const single = (route.request().headers().accept ?? '').includes('vnd.pgrst.object');
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(single ? profile : [profile]) });
  });
}

await check('Community: members without Verified Seller see how to get drops, not the posts', async (page, context) => {
  await signIn(context);
  let asked = false;
  await context.route(/\/rest\/v1\/community_drops/, (route) => {
    asked = true;
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await routeProfile(context, { is_verified_seller: false });
  await page.goto(`${site}/community`);
  await visible(page, 'Upcoming drops are for Verified Sellers');
  if (asked) throw new Error('the page asked for drops it may not show');
});

await check('Community shows the latest #upcoming-drops posts with links, replies and pictures', async (page, context) => {
  await signIn(context);
  const now = Date.now();
  const drops = [
    {
      id: '1600000000000000003', author_name: 'benzonnn', author_avatar: null, posted_at: new Date(now - 60_000).toISOString(), edited_at: null,
      content: '@Pokemon\n\nUpcoming Walmart (US) drops:\n\nUPC: https://www.walmart.com/ip/POKEMON-30TH-ANNIVERSARY-DAY-NIGHT-ULTRA-PREMIUM-COLLECTION/20887353294',
      attachments: [], reply: null, url: 'https://discord.com/channels/1539545293408837697/1600000000000000999/1600000000000000003',
    },
    {
      id: '1600000000000000002', author_name: 'benzonnn', author_avatar: null, posted_at: new Date(now - 86_400_000).toISOString(), edited_at: new Date(now - 86_000_000).toISOString(),
      content: '30th Poster Collection^', reply: { author: 'benzonnn', content: 'https://www.pokemoncenter.com/ queue up @Pokemon' },
      attachments: [{ url: `${site}/og-image.png`, kind: 'image', name: 'restock.png', width: 1200, height: 630 }],
      url: 'https://discord.com/channels/1539545293408837697/1600000000000000999/1600000000000000002',
    },
  ];
  await context.route(/\/rest\/v1\/community_drops/, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(drops) }),
  );
  await routeProfile(context, { is_verified_seller: true });
  await page.goto(`${site}/community`);
  await visible(page, 'Upcoming drops');
  await visible(page, 'Open #upcoming-drops');
  await visible(page, 'walmart.com/ip/POKEMON-30TH-ANNIVERSA…');
  await visible(page, '30th Poster Collection^');
  await visible(page, 'Replying to benzonnn:');
  if ((await page.getByText('Open in Discord', { exact: true }).count()) !== 2) throw new Error('each post should link to Discord');
  if ((await page.getByText('Upcoming events', { exact: true }).count()) !== 0) throw new Error('events should be replaced by drops');
});

await browser.close();
server.close();
console.log(failures ? `${failures} check(s) failed` : 'All website checks passed');
process.exit(failures ? 1 : 0);
