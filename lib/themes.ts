export const themes = [
  { id: "violet-archive", label: "Фиолетовый архив" },
  { id: "signal-noir", label: "Сигнальный нуар" },
  { id: "lilac-lab", label: "Сиреневая лаборатория" },
  { id: "amethyst-garden", label: "Аметистовый сад" },
  { id: "ultraviolet-press", label: "Ультрафиолетовая пресса" },
] as const;

export type ThemeId = (typeof themes)[number]["id"];

export const defaultTheme: ThemeId = "violet-archive";
export const themeStorageKey = "vcobs-theme";

export function isThemeId(value: string | null): value is ThemeId {
  return themes.some((theme) => theme.id === value);
}
