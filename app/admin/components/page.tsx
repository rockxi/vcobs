import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_SESSION_COOKIE, validateAdminSession } from "@/lib/admin-auth";
import { ComponentLibrary } from "@/components/component-library";

export const dynamic = "force-dynamic";

export default async function AdminComponentsPage() {
  if (!validateAdminSession((await cookies()).get(ADMIN_SESSION_COOKIE)?.value)) redirect("/admin");
  return <ComponentLibrary />;
}
