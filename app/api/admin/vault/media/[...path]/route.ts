import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, validateAdminSession } from "@/lib/admin-auth";
import { findUniqueVaultImagePathByBasename, getVaultImage, VaultMediaTooLargeError } from "@/lib/couch";

export const dynamic = "force-dynamic";

const mediaTypes: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
  webp: "image/webp", avif: "image/avif",
};
const responseHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

function matchesSignature(data: Buffer, extension: string) {
  if (extension === "png") return data.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"));
  if (extension === "jpg" || extension === "jpeg") return data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  if (extension === "gif") return ["GIF87a", "GIF89a"].includes(data.toString("ascii", 0, 6));
  if (extension === "webp") return data.toString("ascii", 0, 4) === "RIFF" && data.toString("ascii", 8, 12) === "WEBP";
  if (extension === "avif") return data.toString("ascii", 4, 8) === "ftyp" && ["avif", "avis"].includes(data.toString("ascii", 8, 12));
  return false;
}

type Context = { params: Promise<{ path: string[] }> };

export async function GET(request: Request, { params }: Context) {
  if (!validateAdminSession((await cookies()).get(ADMIN_SESSION_COOKIE)?.value)) {
    return NextResponse.json({ error: "Требуется вход администратора." }, { status: 401, headers: responseHeaders });
  }
  const segments = (await params).path;
  if (!Array.isArray(segments) || !segments.length || segments.some((segment) => !segment || segment === "." || segment === ".." || segment.includes("/") || segment.includes("\\") || segment.includes("\0"))) {
    return NextResponse.json({ error: "Некорректный путь вложения." }, { status: 400, headers: responseHeaders });
  }
  const path = segments.join("/");
  if (path.length > 4096 || path.startsWith("_") || path.includes("//")) return NextResponse.json({ error: "Некорректный путь вложения." }, { status: 400, headers: responseHeaders });
  const extension = path.split(".").at(-1)?.toLowerCase() ?? "";
  const contentType = mediaTypes[extension];
  if (!contentType) return NextResponse.json({ error: "Неподдерживаемый формат изображения." }, { status: 415, headers: responseHeaders });
  try {
    let data = await getVaultImage(path);
    if (!data && new URL(request.url).searchParams.get("obsidian") === "1") {
      const match = await findUniqueVaultImagePathByBasename(segments.at(-1)!);
      if (match === "ambiguous") return NextResponse.json({ error: "Найдено несколько вложений с этим именем. Укажите путь в embed." }, { status: 409, headers: responseHeaders });
      if (match) data = await getVaultImage(match);
    }
    if (!data) return NextResponse.json({ error: "Вложение не найдено." }, { status: 404, headers: responseHeaders });
    if (!matchesSignature(data, extension)) return NextResponse.json({ error: "Некорректное изображение." }, { status: 415, headers: responseHeaders });
    return new Response(new Uint8Array(data), { headers: { ...responseHeaders, "Content-Type": contentType, "Content-Length": String(data.length) } });
  } catch (error) {
    if (error instanceof VaultMediaTooLargeError) return NextResponse.json({ error: "Изображение превышает лимит 20 МиБ." }, { status: 413, headers: responseHeaders });
    return NextResponse.json({ error: "Не удалось загрузить вложение из CouchDB." }, { status: 502, headers: responseHeaders });
  }
}
