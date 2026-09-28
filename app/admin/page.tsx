import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE, adminAuthConfigured, validateAdminSession } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

const adminSections = [
  { href: "/admin/links", name: "Активные ссылки", description: "Просмотр, редактирование и отзыв опубликованных заметок и файлов." },
  { href: "/admin/components", name: "Библиотека компонентов", description: "Токены, темы и состояния общих компонентов интерфейса." },
  { href: "/admin/remote", name: "Удалённые экраны", description: "Подключение к доступным Mac через защищённый браузерный сеанс." },
] as const;

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const authenticated = validateAdminSession((await cookies()).get(ADMIN_SESSION_COOKIE)?.value);
  if (authenticated) return <main className="admin-shell"><section className="admin-hub">
    <header className="admin-hub-header"><div><p className="eyebrow">vcobs · администрирование</p><h1>Панель управления</h1><p>Выберите раздел для работы с опубликованными материалами и общими элементами интерфейса.</p></div><form action="/api/admin/logout" method="post"><button type="submit">Выйти</button></form></header>
    <nav className="admin-hub-grid" aria-label="Разделы администрирования">{adminSections.map((section) => <a className="admin-hub-link" href={section.href} key={section.href}><span className="admin-hub-link-kicker">Раздел</span><h2>{section.name}</h2><p>{section.description}</p><span className="admin-hub-link-action">Открыть <span aria-hidden="true">→</span></span></a>)}</nav>
  </section></main>;

  const params = await searchParams;
  const configured = adminAuthConfigured();
  const message = !configured ? "Вход администратора не настроен. Добавьте секреты на сервере." : params.error === "invalid" ? "Не удалось войти. Проверьте пароль." : params.error === "limited" ? "Слишком много попыток. Повторите позже." : null;
  return <main className="admin-shell"><section className="admin-card"><p className="eyebrow">vcobs · администрирование</p><h1>Вход администратора</h1><p>Войдите, чтобы управлять опубликованными материалами.</p>{message && <p className="form-error" role="alert">{message}</p>}<form action="/api/admin/login" method="post" className="admin-form"><label htmlFor="password">Пароль</label><input id="password" name="password" type="password" autoComplete="current-password" required disabled={!configured} /><button type="submit" disabled={!configured}>Войти</button></form></section></main>;
}
