"use client";

import { useTheme } from "@/components/theme-provider";
import type { VcobsTheme } from "@/lib/themes";

export function PublicThemePicker() {
  const { theme, available, setThemeId } = useTheme();
  return <label className="public-theme-picker"><span>Тема</span><select aria-label="Тема оформления" value={theme.id} onChange={(event) => setThemeId(event.target.value as VcobsTheme["id"])}>{available.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>;
}
