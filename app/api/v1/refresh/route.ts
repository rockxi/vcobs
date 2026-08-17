import { NextRequest, NextResponse } from "next/server";
import { clearPublicationCache, getPublicNotes } from "@/lib/couch";

export async function POST(request: NextRequest) {
  const configuredToken = process.env.VCOBS_REFRESH_TOKEN;
  if (configuredToken && request.headers.get("authorization") !== `Bearer ${configuredToken}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  clearPublicationCache();
  const notes = await getPublicNotes();
  return NextResponse.json({ published: notes.length, refreshedAt: new Date().toISOString() });
}
