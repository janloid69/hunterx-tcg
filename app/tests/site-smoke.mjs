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

await browser.close();
server.close();
console.log(failures ? `${failures} check(s) failed` : 'All website checks passed');
process.exit(failures ? 1 : 0);
