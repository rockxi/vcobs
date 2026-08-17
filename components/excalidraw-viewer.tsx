"use client";

import dynamic from "next/dynamic";
import type { ExcalidrawInitialDataState } from "@excalidraw/excalidraw/types";

const Excalidraw = dynamic(
  () => import("@excalidraw/excalidraw").then((module) => module.Excalidraw),
  { ssr: false, loading: () => <div className="drawing-loading">Загружаем схему…</div> },
);

export function ExcalidrawViewer({ data }: { data: ExcalidrawInitialDataState }) {
  return (
    <div className="excalidraw-frame">
      <Excalidraw
        initialData={{ ...data, scrollToContent: true }}
        viewModeEnabled
        UIOptions={{ canvasActions: { changeViewBackgroundColor: false, clearCanvas: false, export: false, loadScene: false, saveToActiveFile: false, toggleTheme: true } }}
      />
    </div>
  );
}
