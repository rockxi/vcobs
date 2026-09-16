import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_SESSION_COOKIE, adminAuthConfigured, validateAdminSession } from "@/lib/admin-auth";
export const dynamic = "force-dynamic";
export default async function AdminPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (validateAdminSession((await cookies()).get(ADMIN_SESSION_COOKIE)?.value)) redirect("/admin/links");
  const params = await searchParams, configured = adminAuthConfigured(); const message = !configured ? "Вход администратора не настроен. Добавьте секреты на сервере." : params.error === "invalid" ? "Не удалось войти. Проверьте пароль." : params.error === "limited" ? "Слишком много попыток. Повторите позже." : null;
  return <main className="admin-shell"><section className="admin-card"><p className="eyebrow">vcobs · администрирование</p><h1>Вход администратора</h1><p>Войдите, чтобы управлять опубликованными материалами.</p>{message && <p className="form-error" role="alert">{message}</p>}<form action="/api/admin/login" method="post" className="admin-form"><label htmlFor="password">Пароль</label><input id="password" name="password" type="password" autoComplete="current-password" required disabled={!configured} /><button type="submit" disabled={!configured}>Войти</button></form></section></main>;
}
