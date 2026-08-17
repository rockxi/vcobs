import { NextRequest, NextResponse } from "next/server";
import { getFile, getPublicNote } from "@/lib/couch";
import { mediaType, referencedMedia, resolveVaultPath } from "@/lib/markdown";

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const reference = request.nextUrl.searchParams.get("file");
  if (!reference) return new NextResponse("Missing file", { status: 400 });

  const note = await getPublicNote(slug);
  if (!note || !referencedMedia(note.markdown).has(reference)) return new NextResponse("Not found", { status: 404 });

  const file = await getFile(resolveVaultPath(note.path, reference));
  if (!file) return new NextResponse("Not found", { status: 404 });

  const type = mediaType(file.file.path);
  const body = Buffer.from(file.data, "base64");
  return new NextResponse(body, {
    headers: { "Content-Type": type, "Cache-Control": "public, max-age=3600, immutable" },
  });
}
