import type { Metadata } from "next";
import "@excalidraw/excalidraw/index.css";
import "./globals.css";
import "./themes/violet-archive.css";
import "./themes/signal-noir.css";
import "./themes/lilac-lab.css";
import "./themes/amethyst-garden.css";
import "./themes/ultraviolet-press.css";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { defaultTheme, themes, themeStorageKey } from "@/lib/themes";

export const metadata: Metadata = {
  title: "vcobs — опубликованные заметки",
  description: "Безопасный просмотр заметок Obsidian из CouchDB",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const themeIds = themes.map((theme) => theme.id);
  const themeBootstrap = `(() => { try { const value = localStorage.getItem(${JSON.stringify(themeStorageKey)}); const allowed = new Set(${JSON.stringify(themeIds)}); document.documentElement.dataset.theme = allowed.has(value) ? value : ${JSON.stringify(defaultTheme)}; } catch { document.documentElement.dataset.theme = ${JSON.stringify(defaultTheme)}; } })();`;

  return (
    <html lang="ru" data-theme={defaultTheme} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body>
        <ThemeSwitcher />
        {children}
      </body>
    </html>
  );
}
