import type { Metadata } from "next";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeBackdrop } from "@/components/theme-backdrop";
import { getEnabledThemes } from "@/lib/theme-settings";
import { defaultVcobsTheme, vcobsThemes, themeStyleSheet } from "@/lib/themes";
import { themeBootstrapScript } from "@/lib/theme-preference";
import "@excalidraw/excalidraw/index.css";
import "./globals.css";
import "./liquid-chrome.css";

// Theme availability is an administrator setting read at request time, including 404s.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "vcobs — опубликованные заметки",
  description: "Безопасный просмотр заметок Obsidian из CouchDB",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const enabled = await getEnabledThemes();
  const bootstrap = themeBootstrapScript({ ids: vcobsThemes.map((theme) => theme.id), enabled, defaultId: defaultVcobsTheme.id });
  return (
    <html lang="ru" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: bootstrap }} /><style dangerouslySetInnerHTML={{ __html: themeStyleSheet() }} /></head>
      <body><ThemeProvider enabled={enabled}><ThemeBackdrop />{children}</ThemeProvider></body>
    </html>
  );
}
