import type { Metadata } from "next";
import "@excalidraw/excalidraw/index.css";
import "./globals.css";
import { SmoothScroll } from "@/components/smooth-scroll";

export const metadata: Metadata = {
  title: "vcobs — опубликованные заметки",
  description: "Безопасный просмотр заметок Obsidian из CouchDB",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body><SmoothScroll />{children}</body>
    </html>
  );
}
