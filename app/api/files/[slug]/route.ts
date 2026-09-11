import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { getSharedFile } from "@/lib/shared-files";

export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const file = await getSharedFile(slug);
  if (!file) return new NextResponse("Not found", { status: 404 });

  const body = Readable.toWeb(createReadStream(file.path)) as ReadableStream<Uint8Array>;
  const encodedName = encodeURIComponent(file.fileName);
  const asciiName = file.fileName.replace(/[^\x20-\x7e]/g, "_");
  return new NextResponse(body, {
    headers: {
      "Content-Type": file.contentType,
      "Content-Length": String(file.size),
      "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodedName}`,
      "Cache-Control": "private, no-store",
    },
  });
}
