import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { vcobsThemes, type VcobsTheme } from "@/lib/themes";

export type ThemeId = VcobsTheme["id"];
const ids = vcobsThemes.map((theme) => theme.id);
const filePath = path.join(process.env.PASTE_DATA_DIR ?? path.join(process.cwd(), "data", "pastes"), ".theme-settings.json");

export async function getEnabledThemes(): Promise<ThemeId[]> {
  try {
    const parsed: unknown = JSON.parse(await readFile(filePath, "utf8"));
    if (!Array.isArray(parsed)) return ids;
    const enabled = ids.filter((id) => parsed.includes(id));
    return enabled.length ? enabled : ids;
  } catch { return ids; }
}

export async function saveEnabledThemes(value: unknown): Promise<ThemeId[]> {
  if (!Array.isArray(value) || !value.every((id) => typeof id === "string" && ids.includes(id as ThemeId))) throw new Error("Invalid theme list");
  const enabled = ids.filter((id) => value.includes(id));
  if (!enabled.length) throw new Error("At least one theme is required");
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${randomBytes(8).toString("hex")}.tmp`;
  await writeFile(temporary, JSON.stringify(enabled), { encoding: "utf8", mode: 0o600, flag: "wx" });
  await rename(temporary, filePath);
  return enabled;
}
