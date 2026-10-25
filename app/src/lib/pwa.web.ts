// Lets members add HunterX to their phone's home screen: links the web app
// manifest and icons, and keeps Chrome's install offer for an Install button.

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

// When opened from the home screen, iPhones draw the page under the status bar.
// "viewport-fit=cover" makes the browser report how tall that area is, so the
// header and pages can keep their buttons below it. Runs as soon as this file
// loads, before the first screen renders.
if (typeof document !== 'undefined') {
  const viewport = document.querySelector('meta[name="viewport"]');
  const content = viewport?.getAttribute('content') ?? 'width=device-width, initial-scale=1';
  if (viewport && !content.includes('viewport-fit')) viewport.setAttribute('content', `${content}, viewport-fit=cover`);
  document.documentElement.style.backgroundColor = '#0E0E10';
  if (document.body) document.body.style.backgroundColor = '#0E0E10';
}

let deferred: InstallPrompt | null = null;
const listeners = new Set<() => void>();
let started = false;

function addHead(tag: 'link' | 'meta', attrs: Record<string, string>) {
  const key = tag === 'link' ? `link[rel="${attrs.rel}"]` : `meta[name="${attrs.name}"]`;
  if (document.head.querySelector(key)) return;
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
  document.head.appendChild(el);
}

export function setupPwa(): void {
  if (started || typeof document === 'undefined') return;
  started = true;
  addHead('link', { rel: 'manifest', href: '/manifest.webmanifest' });
  addHead('link', { rel: 'apple-touch-icon', href: '/icons/apple-touch-icon.png' });
  addHead('meta', { name: 'theme-color', content: '#0E0E10' });
  addHead('meta', { name: 'mobile-web-app-capable', content: 'yes' });
  addHead('meta', { name: 'apple-mobile-web-app-capable', content: 'yes' });
  addHead('meta', { name: 'apple-mobile-web-app-title', content: 'HunterX' });
  addHead('meta', { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' });
  addHead('meta', { name: 'description', content: 'Track your cards in pesos, scan cards, and trade with the HunterX Discord community.' });

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferred = event as InstallPrompt;
    listeners.forEach((listener) => listener());
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    listeners.forEach((listener) => listener());
  });
}

/** True when HunterX is open from the home screen (not in a browser tab). */
export function isInstalled(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export type InstallPlatform = 'ios' | 'android' | 'desktop';

export function installPlatform(): InstallPlatform {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && 'ontouchend' in document)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}

export function canPromptInstall(): boolean {
  return deferred !== null;
}

/** Shows the browser's own install box (Chrome and Edge). Returns true if installed. */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const prompt = deferred;
  deferred = null;
  await prompt.prompt();
  const choice = await prompt.userChoice;
  listeners.forEach((listener) => listener());
  return choice.outcome === 'accepted';
}

export function onInstallChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
