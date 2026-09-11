import { NextResponse } from "next/server";
import { MAX_SHARED_FILE_BYTES, SHARED_FILE_TTL_MS, SharedFileTooLargeError, storeSharedFile } from "@/lib/shared-files";
import { decodeUploadFileName } from "@/components/file-share-utils";

function fileNameFromRequest(request: Request) {
  const encodedName = request.headers.get("x-file-name");
  if (encodedName) return decodeUploadFileName(encodedName);
  return request.headers.get("content-disposition")?.match(/filename="?([^";]+)"?/i)?.[1] ?? "file";
}

export async function POST(request: Request) {
  const contentLength = request.headers.get("content-length");
  if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > MAX_SHARED_FILE_BYTES) {
    return NextResponse.json({ error: "Файл больше 500 МБ." }, { status: 413 });
  }
  if (!request.body) return NextResponse.json({ error: "Прикрепите файл." }, { status: 400 });

  try {
    const file = await storeSharedFile({
      stream: request.body,
      fileName: fileNameFromRequest(request),
      contentType: request.headers.get("content-type"),
    });
    return NextResponse.json({ slug: file.slug, url: `/${file.slug}`, downloadUrl: `/api/files/${file.slug}`, fileName: file.fileName, size: file.size, expiresAt: new Date(Date.parse(file.createdAt) + SHARED_FILE_TTL_MS).toISOString() }, { status: 201 });
  } catch (error) {
    if (error instanceof SharedFileTooLargeError) return NextResponse.json({ error: error.message }, { status: 413 });
    return NextResponse.json({ error: "Не удалось сохранить файл." }, { status: 500 });
  }
}
