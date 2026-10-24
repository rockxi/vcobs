"use client";

import dynamic from "next/dynamic";
import type { ExcalidrawInitialDataState } from "@excalidraw/excalidraw/types";
import { useTheme } from "@/components/theme-provider";
import { themeScheme } from "@/lib/themes";

const Excalidraw = dynamic(
  () => import("@excalidraw/excalidraw").then((module) => module.Excalidraw),
  { ssr: false, loading: () => <div className="drawing-loading">Загружаем схему…</div> },
);

export function ExcalidrawViewer({ data }: { data: ExcalidrawInitialDataState }) {
  const { theme } = useTheme();
  return (
    <div className="excalidraw-frame">
      <Excalidraw
        initialData={{ ...data, scrollToContent: true }}
        theme={themeScheme(theme)}
        viewModeEnabled
        UIOptions={{ canvasActions: { changeViewBackgroundColor: false, clearCanvas: false, export: false, loadScene: false, saveToActiveFile: false, toggleTheme: false } }}
      />
    </div>
  );
}
