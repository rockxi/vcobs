import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_SESSION_COOKIE, validateAdminSession } from "@/lib/admin-auth";
import { AdminVaultWorkspace } from "@/components/admin-vault-workspace";

export const dynamic = "force-dynamic";

export default async function AdminVaultPage() {
  if (!validateAdminSession((await cookies()).get(ADMIN_SESSION_COOKIE)?.value)) redirect("/admin");
  return <AdminVaultWorkspace />;
}
