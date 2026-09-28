import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_SESSION_COOKIE, validateAdminSession } from "@/lib/admin-auth";
import { getEnabledThemes } from "@/lib/theme-settings";
import { vcobsThemes } from "@/lib/themes";

export const dynamic = "force-dynamic";

export default async function AdminThemesPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  if (!validateAdminSession((await cookies()).get(ADMIN_SESSION_COOKIE)?.value)) redirect("/admin");
  const [enabled, params] = await Promise.all([getEnabledThemes(), searchParams]);
  return <main className="admin-shell"><section className="admin-inventory admin-themes">
    <header className="admin-inventory-header"><div><h1>Темы для посетителей</h1><p>Отмеченные темы появятся в меню на главной странице и у заметок. Хотя бы одна тема должна остаться доступной.</p></div><Link href="/admin">← Админка</Link></header>
    {params.saved && <p className="save-success" role="status">Настройки сохранены.</p>}
    {params.error && <p className="form-error" role="alert">Выберите хотя бы одну тему.</p>}
    <form action="/api/admin/themes" method="post" className="admin-theme-form">
      {vcobsThemes.map((theme) => <label className="admin-theme-row" key={theme.id}><input type="checkbox" name="theme" value={theme.id} defaultChecked={enabled.includes(theme.id)} /><span className="admin-theme-swatch" style={{ background: theme.tokens.accent }} aria-hidden="true" /><span><strong>{theme.name}</strong><small>{theme.description}</small></span></label>)}
      <button type="submit">Сохранить доступные темы</button>
    </form>
  </section></main>;
}
