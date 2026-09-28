import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE, adminRedirectUrl, originIsSameSite, validateAdminSession } from "@/lib/admin-auth";
import { saveEnabledThemes } from "@/lib/theme-settings";

export async function POST(request: Request) {
  if (!validateAdminSession((await cookies()).get(ADMIN_SESSION_COOKIE)?.value)) return new NextResponse("Unauthorized", { status: 401 });
  if (!originIsSameSite(request)) return new NextResponse("Forbidden", { status: 403 });
  const successUrl = adminRedirectUrl(request, "/admin/themes?saved=1");
  const errorUrl = adminRedirectUrl(request, "/admin/themes?error=1");
  if (!successUrl || !errorUrl) return new NextResponse("Forbidden", { status: 403 });
  const form = await request.formData();
  try {
    await saveEnabledThemes(form.getAll("theme"));
    return NextResponse.redirect(successUrl, 303);
  } catch {
    return NextResponse.redirect(errorUrl, 303);
  }
}
