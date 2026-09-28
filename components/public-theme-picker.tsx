"use client";

import { useEffect, useState } from "react";
import { defaultVcobsTheme, vcobsThemes } from "@/lib/themes";
import type { ThemeId } from "@/lib/theme-settings";

export function PublicThemePicker({ enabled }: { enabled: ThemeId[] }) {
  const available = vcobsThemes.filter((theme) => enabled.includes(theme.id));
  const fallback = available.find((theme) => theme.id === defaultVcobsTheme.id) ?? available[0] ?? defaultVcobsTheme;
  const [selected, setSelected] = useState<ThemeId>(fallback.id);

  useEffect(() => {
    const stored = localStorage.getItem("vcobs-theme");
    const current = available.find((theme) => theme.id === stored) ?? fallback;
    setSelected(current.id);
    document.documentElement.dataset.vcobsTheme = current.id;
  }, [enabled.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  function select(id: ThemeId) {
    setSelected(id);
    localStorage.setItem("vcobs-theme", id);
    document.documentElement.dataset.vcobsTheme = id;
  }

  return <label className="public-theme-picker"><span>Тема</span><select aria-label="Тема оформления" value={selected} onChange={(event) => select(event.target.value as ThemeId)}>{available.map((theme) => <option key={theme.id} value={theme.id}>{theme.name}</option>)}</select></label>;
}
