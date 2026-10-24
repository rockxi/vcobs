export type VcobsTheme = {
  id: "obsidianite" | "violet-night" | "lavender-ink" | "neon-grid" | "frutiger-aero" | "liquid-glass" | "liquid-chrome";
  name: string;
  description: string;
  tokens: Record<"ink" | "muted" | "paper" | "surface" | "surface-raised" | "line" | "accent" | "lime", string>;
  roles?: Record<string, string>;
};

// This is the single theme identity/token source for component, animation, and
// preload previews. Keep variants close to the established dark-violet vcobs UI.
export const vcobsThemes = [
  {
    id: "obsidianite",
    name: "Obsidianite",
    description: "Базовая тёмная фиолетовая тема vcobs",
    tokens: { ink: "#e8e6ee", muted: "#9895a3", paper: "#12131a", surface: "#16171f", "surface-raised": "#1b1c25", line: "#292a34", accent: "#b66cff", lime: "#c4a7ff" },
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
  {
    id: "liquid-glass",
    name: "Liquid Glass",
    description: "Тёмное стекло с мягким фоном и спокойными поверхностями в духе macOS",
    tokens: { ink: "#f1f1f4", muted: "#b4b3bc", paper: "#111116", surface: "#222127", "surface-raised": "#2c2b32", line: "#494851", accent: "#c9d8fb", lime: "#a9c1ff" },
  },
  {
    id: "liquid-chrome",
    name: "Liquid Chrome",
    description: "Зеркальное серебро, чёрные и синие отражения, спокойные поверхности для текста",
    tokens: { ink: "#eaf0f7", muted: "#a8b6c8", paper: "#0a101b", surface: "#101a29", "surface-raised": "#1a293d", line: "#35455b", accent: "#bbd6ff", lime: "#e0eaff" },
    roles: {
      "page-bg": "#060b13", "document-bg": "#0a101b", "sidebar-bg": "#0c1421", "header-bg": "#0d1624",
      "input-bg": "#080f1b", "overlay-bg": "#142035", "code-bg": "#142035", "code-fg": "#d1e2fb",
      "heading-primary": "#edf3fc", "heading-rule": "#7892b5", "strong-start": "#e3edff", "strong-end": "#e3edff",
      "action-bg": "#dae4f1", "action-end": "#8b9db7", "action-hover": "#f0f5ff", "on-action": "#09111f",
      "control-gradient": "linear-gradient(172deg,#ffffff 0%,#d5dfed 29%,#a4b6ce 49%,#edf4ff 51%,#acbdd3 76%,#71839e 100%)",
      "control-surface": "linear-gradient(178deg,#33445d 0%,#1b2a40 35%,#0c1523 49%,#263b56 51%,#152237 100%)",
      "control-raised": "linear-gradient(174deg,#425671 0%,#26394f 32%,#101b2a 50%,#314864 52%,#1b2b42 100%)",
      "control-foreground": "#eef4ff", "control-border": "#6d819c", "control-radius": "12px",
      "control-shadow": "inset 0 1px 0 #e4efff45,inset 0 -1px 0 #050a1377,0 5px 14px #00000033",
      "selected-bg": "#253b59", "selected-fg": "#f1f6ff", "hover-bg": "#293d57", "hover-border": "#c5daf6",
      "focus-ring": "#b4d4ff", "focus-halo": "#b4d4ff33", "shadow-color": "#00000066", "highlight": "#e2efff33",
      "page-artwork": "radial-gradient(ellipse at 92% 8%,#25456b33,transparent 45%)",
    },
  },
] as const satisfies readonly VcobsTheme[];

export const defaultVcobsTheme = vcobsThemes[0];

export function themeCssVariables(theme: VcobsTheme) {
  const light = themeScheme(theme) === "light";
  const mix = (a: string, amount: number, b = "transparent") => `color-mix(in srgb,var(--${a}) ${amount}%,${b === "transparent" ? b : `var(--${b})`})`;
  const roles = {
    "theme-scheme": themeScheme(theme),
    "page-bg": theme.id === "obsidianite" ? "#0d0e13" : "var(--paper)",
    "sidebar-bg": "var(--surface)", "header-bg": mix("paper", 94),
    "document-bg": "var(--paper)", "input-bg": light ? "var(--surface)" : mix("paper", 80, "page-bg"),
    "overlay-bg": mix("surface-raised", 98), "code-bg": "var(--surface-raised)",
    "code-fg": light ? "var(--ink)" : mix("accent", 40, "ink"),
    "prose-fg": mix("ink", 86, "muted"), "heading-fg": "var(--ink)",
    "strong-start": theme.id === "obsidianite" ? "#87c2fd" : light ? "var(--ink)" : mix("accent", 35, "ink"), "strong-end": theme.id === "obsidianite" ? "#dcb9fc" : "var(--accent)",
    "heading-rule": theme.id === "obsidianite" ? "#f4569d" : "var(--accent)",
    "heading-primary": theme.id === "obsidianite" ? "#0fb6d6" : "var(--heading-fg)",
    "page-artwork": theme.id === "obsidianite" ? "radial-gradient(circle at 72% 32%,rgba(84,62,119,.10),transparent 34rem)" : "none",
    "document-artwork": theme.id === "obsidianite" ? "radial-gradient(circle at 72% 20%,rgba(87,63,124,.09),transparent 31rem)" : "none",
    "faint-fg": "var(--muted)", "link-fg": light ? "var(--ink)" : "var(--accent)",
    "link-underline": mix("accent", 55, "line"), "border-strong": mix("accent", 35, "line"),
    "hover-border": "var(--accent)", "hover-bg": "var(--surface-raised)",
    "selected-bg": mix("accent", light ? 15 : 22, "surface"), "selected-fg": "var(--ink)",
    "focus-ring": "var(--accent)", "focus-halo": mix("accent", 18),
    "action-bg": theme.id === "obsidianite" ? "#713aaa" : light ? "#076fa9" : "var(--accent)",
    "action-end": theme.id === "obsidianite" ? "#6334ad" : light ? "#075c8d" : mix("accent", 75, "paper"),
    "action-hover": theme.id === "obsidianite" ? "#8c4fca" : light ? "#075c8d" : mix("accent", 80, "ink"),
    "on-action": theme.id === "obsidianite" || light ? "#ffffff" : "var(--paper)",
    "success-fg": light ? "#176b3b" : "#a8ddad", "error-fg": light ? "#a32239" : "#ff9ba7",
    "warning-fg": light ? "#795000" : "#f5d398", "danger-bg": light ? "#aa2943" : "#7b293d", "on-danger": "#ffffff",
    "success-bg": light ? "#e4f6ea" : "#223c2d", "success-border": light ? "#66a97a" : "#405747",
    "error-bg": light ? "#ffedf0" : "#432735", "error-border": light ? "#bc6879" : "#784051",
    "warning-bg": light ? "#fff4d7" : "#3c3020", "warning-border": light ? "#ae8742" : "#786140",
    "selection-bg": mix("accent", light ? 25 : 45, "surface"), "selection-fg": "var(--ink)",
    "scrim": light ? "#073c6366" : "#00000088", "shadow-color": light ? "#073c6322" : "#04020a66",
    "highlight": light ? "#ffffffaa" : "#ffffff0d", "accent-glow": mix("accent", 18),
    "control-radius": theme.id === "liquid-glass" ? "14px" : "initial",
    "control-shadow": theme.id === "frutiger-aero" ? "0 6px 18px var(--shadow-color)" : "initial",
    "control-gradient": "linear-gradient(135deg,var(--action-bg),var(--action-end))",
    "control-surface": "var(--surface)", "control-raised": "var(--surface-raised)",
    "control-foreground": "var(--ink)", "control-border": "var(--line)",
    "shadow": "none",
  };
  return Object.fromEntries(Object.entries({ ...theme.tokens, ...roles, ...theme.roles }).map(([name, value]) => [`--${name}`, value]));
}

export function themeScheme(theme: VcobsTheme): "light" | "dark" {
  return theme.id === "frutiger-aero" ? "light" : "dark";
}

// Only the static, application-owned registry is serialized. Never pass user data.
export function themeStyleSheet() {
  return vcobsThemes.map((theme, index) => `${index === 0 ? ":root," : ""}html[data-vcobs-theme="${theme.id}"]{${Object.entries(themeCssVariables(theme)).map(([name, value]) => `${name}:${value}`).join(";")};color-scheme:${themeScheme(theme)}}`).join("\n");
}
