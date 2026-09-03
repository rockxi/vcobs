import type { Metadata } from "next";
import "@excalidraw/excalidraw/index.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "vcobs — опубликованные заметки",
  description: "Безопасный просмотр заметок Obsidian из CouchDB",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
