import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { RemoteDesktop } from "@/components/remote-desktop";
import { ADMIN_SESSION_COOKIE, validateAdminSession } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export default async function AdminRemotePage() {
  if (!validateAdminSession((await cookies()).get(ADMIN_SESSION_COOKIE)?.value)) redirect("/admin");
  return <main className="admin-shell"><section className="admin-inventory remote-desktop-shell">
    <header className="admin-inventory-header"><div><p className="eyebrow">vcobs · администрирование</p><h1>Удалённые экраны</h1><p>Сеанс идёт через защищённый relay. Пароль VNC остаётся только в этом браузере.</p></div><a className="admin-public-link" href="/admin">← Панель управления</a></header>
    <RemoteDesktop />
  </section></main>;
}
