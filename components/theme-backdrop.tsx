"use client";

import dynamic from "next/dynamic";
import { useTheme } from "@/components/theme-provider";

const LiquidChromeScene = dynamic(() => import("@/components/liquid-chrome-scene"), { ssr: false });

export function ThemeBackdrop() {
  const { theme } = useTheme();
  return theme.id === "liquid-chrome" ? <LiquidChromeScene /> : null;
}
