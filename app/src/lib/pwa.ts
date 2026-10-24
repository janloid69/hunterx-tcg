// The phone apps install from the stores, so there's nothing to set up here.
// The website version is pwa.web.ts.

export type InstallPlatform = 'ios' | 'android' | 'desktop';

export function setupPwa(): void {}
export function isInstalled(): boolean {
  return true;
}
export function installPlatform(): InstallPlatform {
  return 'desktop';
}
export function canPromptInstall(): boolean {
  return false;
}
export async function promptInstall(): Promise<boolean> {
  return false;
}
export function onInstallChange(_listener: () => void): () => void {
  return () => {};
}
