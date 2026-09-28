import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE, originIsSameSite, validateAdminSession } from "@/lib/admin-auth";
import { saveEnabledThemes } from "@/lib/theme-settings";

export async function POST(request: Request) {
  if (!validateAdminSession((await cookies()).get(ADMIN_SESSION_COOKIE)?.value)) return new NextResponse("Unauthorized", { status: 401 });
  if (!originIsSameSite(request)) return new NextResponse("Forbidden", { status: 403 });
  const form = await request.formData();
  try {
    await saveEnabledThemes(form.getAll("theme"));
    return NextResponse.redirect(new URL("/admin/themes?saved=1", request.url), 303);
  } catch {
    return NextResponse.redirect(new URL("/admin/themes?error=1", request.url), 303);
  }
}
