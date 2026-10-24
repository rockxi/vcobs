export const themeStorageKey = "vcobs-theme";

export type ThemePreferenceConfig = {
  ids: readonly string[];
  enabled: readonly string[];
  defaultId: string;
};

// Self-contained so the exact same resolver can run before React hydrates.
export function resolveThemePreference(value: string | null, pathname: string, config: ThemePreferenceConfig): string {
  const admin = pathname === "/admin" || pathname.startsWith("/admin/");
  const allowed = admin ? config.ids : config.ids.filter((id) => config.enabled.includes(id));
  const fallback = allowed.includes(config.defaultId) ? config.defaultId : allowed[0] ?? config.defaultId;
  return value !== null && allowed.includes(value) ? value : fallback;
}

export function readThemePreference(storage: Pick<Storage, "getItem">): string | null {
  try { return storage.getItem(themeStorageKey); } catch { return null; }
}

export function writeThemePreference(storage: Pick<Storage, "setItem">, value: string): void {
  try { storage.setItem(themeStorageKey, value); } catch { /* The current tab still keeps its choice. */ }
}

function bootstrapTheme(config: ThemePreferenceConfig, key: string, resolve: typeof resolveThemePreference) {
  let stored: string | null = null;
  try { stored = window.localStorage.getItem(key); } catch { /* Storage may be unavailable. */ }
  document.documentElement.dataset.vcobsTheme = resolve(stored, window.location.pathname, config);
}

export function themeBootstrapScript(config: ThemePreferenceConfig): string {
  // Escape script-breaking markup even if a future registry contains arbitrary labels.
  const serialized = JSON.stringify(config).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
  return `(${bootstrapTheme.toString()})(${serialized},${JSON.stringify(themeStorageKey)},${resolveThemePreference.toString()});`;
}
