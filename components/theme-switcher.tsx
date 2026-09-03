"use client";

import { useEffect, useState } from "react";
import { defaultTheme, isThemeId, themes, themeStorageKey, type ThemeId } from "@/lib/themes";

function readTheme(): ThemeId {
  try {
    const storedTheme = localStorage.getItem(themeStorageKey);
    return isThemeId(storedTheme) ? storedTheme : defaultTheme;
  } catch {
    return defaultTheme;
  }
}

export function ThemeSwitcher() {
  const [theme, setTheme] = useState<ThemeId>(defaultTheme);

  useEffect(() => {
    setTheme(readTheme());
  }, []);

  function changeTheme(nextTheme: ThemeId) {
    document.documentElement.dataset.theme = nextTheme;
    try {
      localStorage.setItem(themeStorageKey, nextTheme);
    } catch {
      // Private browsing or storage policies must not prevent a live theme change.
    }
    setTheme(nextTheme);
  }

  return (
    <div className="theme-switcher">
      <label htmlFor="theme-select">Тема</label>
      <select
        aria-label="Выбор темы оформления"
        id="theme-select"
        onChange={(event) => changeTheme(event.target.value as ThemeId)}
        value={theme}
      >
        {themes.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select>
    </div>
  );
}
