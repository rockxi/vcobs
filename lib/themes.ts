export type VcobsTheme = {
  id: "obsidianite" | "violet-night" | "lavender-ink" | "neon-grid" | "frutiger-aero";
  name: string;
  description: string;
  tokens: Record<"ink" | "muted" | "paper" | "surface" | "surface-raised" | "line" | "accent" | "lime", string>;
};

// This is the single theme identity/token source for component, animation, and
// preload previews. Keep variants close to the established dark-violet vcobs UI.
export const vcobsThemes = [
  {
    id: "obsidianite",
    name: "Obsidianite",
    description: "Базовая тёмная фиолетовая тема vcobs",
    tokens: { ink: "#eeeaf8", muted: "#aaa2bc", paper: "#15121d", surface: "#1b1725", "surface-raised": "#211a2e", line: "#302940", accent: "#b18cff", lime: "#c4a7ff" },
  },
  {
    id: "violet-night",
    name: "Violet night",
    description: "Более глубокий фиолетовый контраст",
    tokens: { ink: "#f0eafd", muted: "#ada2c4", paper: "#110e19", surface: "#191329", "surface-raised": "#241938", line: "#3a2b52", accent: "#ad83ff", lime: "#d0b5ff" },
  },
  {
    id: "lavender-ink",
    name: "Lavender ink",
    description: "Мягкая лавандовая подача в той же тёмной гамме",
    tokens: { ink: "#eee9f5", muted: "#aaa1b7", paper: "#18131d", surface: "#211a28", "surface-raised": "#2a2134", line: "#403348", accent: "#bd94ea", lime: "#d5bbf0" },
  },
  {
    id: "neon-grid",
    name: "Neon Grid",
    description: "HUD-сетка с циановыми каналами, магентовыми сигналами и контрастной техно-типографикой",
    tokens: { ink: "#e8feff", muted: "#8faeb6", paper: "#071117", surface: "#0b1c25", "surface-raised": "#102934", line: "#1c5260", accent: "#21e6f3", lime: "#ff4fbf" },
  },
  {
    id: "frutiger-aero",
    name: "Frutiger Aero",
    description: "Небесное стекло, водные блики и живые зелёные акценты",
    tokens: { ink: "#073c63", muted: "#396783", paper: "#c9f4ff", surface: "#efffff", "surface-raised": "#d9f8ff", line: "#76cbe5", accent: "#087fc0", lime: "#168d3d" },
  },
] as const satisfies readonly VcobsTheme[];

export const defaultVcobsTheme = vcobsThemes[0];

export function themeCssVariables(theme: VcobsTheme) {
  return Object.fromEntries(Object.entries(theme.tokens).map(([name, value]) => [`--${name}`, value]));
}
