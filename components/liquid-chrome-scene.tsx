"use client";

import { useEffect, useRef, useState } from "react";
import { createChromeRenderer } from "@/lib/liquid-chrome-renderer";

export default function LiquidChromeScene() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!canvas.current) return;
    const renderer = createChromeRenderer(canvas.current, setReady);
    return () => renderer?.dispose();
  }, []);
  return <div className="liquid-chrome-backdrop" aria-hidden="true" data-renderer={ready ? "webgl" : "fallback"}>
    <canvas ref={canvas} className="liquid-chrome-canvas" />
  </div>;
}
