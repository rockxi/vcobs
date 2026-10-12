import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_SESSION_COOKIE, validateAdminSession } from "@/lib/admin-auth";
import { AdminChatWorkspace } from "@/components/admin-chat-workspace";

export const dynamic = "force-dynamic";
export default async function AdminChatPage() {
  if (!validateAdminSession((await cookies()).get(ADMIN_SESSION_COOKIE)?.value)) redirect("/admin");
  return <AdminChatWorkspace />;
}
