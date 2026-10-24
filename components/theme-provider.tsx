"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { defaultVcobsTheme, vcobsThemes, type VcobsTheme } from "@/lib/themes";
import { readThemePreference, resolveThemePreference, themeStorageKey, writeThemePreference } from "@/lib/theme-preference";

type ThemeId = VcobsTheme["id"];
type ThemeContextValue = { theme: VcobsTheme; available: readonly VcobsTheme[]; setThemeId: (id: ThemeId) => void };
const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ enabled, children }: { enabled: ThemeId[]; children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  const config = useMemo(() => ({ ids: vcobsThemes.map((theme) => theme.id), enabled, defaultId: defaultVcobsTheme.id }), [enabled]);
  const preference = useRef<string | null>(null);
  const initialized = useRef(false);
  const [selected, setSelected] = useState(() => resolveThemePreference(null, pathname, config));
  const admin = pathname === "/admin" || pathname.startsWith("/admin/");
  const available = admin ? vcobsThemes : vcobsThemes.filter((theme) => enabled.includes(theme.id));
  const resolved = resolveThemePreference(selected, pathname, config);
  const theme = vcobsThemes.find((item) => item.id === resolved) ?? defaultVcobsTheme;

  const apply = useCallback((value: string | null) => {
    preference.current = value;
    const id = resolveThemePreference(value, pathname, config);
    document.documentElement.dataset.vcobsTheme = id;
    setSelected(id);
  }, [pathname, config]);

  useLayoutEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      // Accessing the localStorage getter can itself throw in restricted browsers.
      try { preference.current = readThemePreference(window.localStorage); } catch { /* Use the fallback. */ }
    }
    apply(preference.current);
  }, [apply]);

  useEffect(() => {
    function synchronize(event: StorageEvent) {
      if (event.key !== themeStorageKey && event.key !== null) return;
      try { if (event.storageArea && event.storageArea !== window.localStorage) return; } catch { return; }
      apply(event.newValue);
    }
    window.addEventListener("storage", synchronize);
    return () => window.removeEventListener("storage", synchronize);
  }, [apply]);

  const setThemeId = useCallback((id: ThemeId) => {
    const next = resolveThemePreference(id, pathname, config);
    apply(next);
    try { writeThemePreference(window.localStorage, next); } catch { /* Keep the in-memory preference. */ }
  }, [apply, pathname, config]);

  return <ThemeContext.Provider value={{ theme, available, setThemeId }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside ThemeProvider");
  return context;
}
