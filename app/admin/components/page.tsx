import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_SESSION_COOKIE, validateAdminSession } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

const colorTokens = [
  ["--ink", "#eeeaf8", "Основной текст"],
  ["--muted", "#aaa2bc", "Вторичный текст"],
  ["--paper", "#15121d", "Основная поверхность"],
  ["--surface", "#1b1725", "Поверхность карточки"],
  ["--surface-raised", "#211a2e", "Поднятая поверхность"],
  ["--line", "#302940", "Граница"],
  ["--accent", "#b18cff", "Акцент и ссылки"],
  ["--lime", "#c4a7ff", "Светлый акцент"],
] as const;

const components = [
  { name: "button", description: "Основное и заблокированное действия", preview: <div className="component-buttons"><button type="button">Опубликовать</button><button type="button" disabled>Недоступно</button></div> },
  { name: "text_input", description: "Поле с фокусом и подсказкой", preview: <label className="component-field">Название заметки<input defaultValue="Еженедельный обзор" aria-label="Название заметки" /><small>До 80 символов</small></label> },
  { name: "textarea", description: "Многострочный ввод", preview: <label className="component-field">Содержимое<textarea defaultValue="Запишите мысль, ссылку или план." aria-label="Содержимое заметки" /></label> },
  { name: "link", description: "Навигационное действие", preview: <Link className="component-link" href="/admin/links">Открыть активные ссылки <span aria-hidden="true">→</span></Link> },
  { name: "status_badge", description: "Статус публикации", preview: <div className="component-badges"><span className="admin-status editable">редактирование</span><span className="admin-status">только чтение</span></div> },
  { name: "notice", description: "Статус и ошибка формы", preview: <div className="component-notices"><p className="component-success" role="status">Ссылка готова к отправке.</p><p className="form-error" role="alert">Не удалось сохранить изменения.</p></div> },
] as const;

export default async function AdminComponentsPage() {
  if (!validateAdminSession((await cookies()).get(ADMIN_SESSION_COOKIE)?.value)) redirect("/admin");

  return <main className="admin-shell component-library-shell">
    <section className="admin-inventory component-library">
      <header className="admin-inventory-header">
        <div><p className="eyebrow">vcobs · design system</p><h1>Библиотека компонентов</h1><p>Статический словарь production-интерфейса. Имена ниже используются как канонические идентификаторы для следующих экранов.</p></div>
        <nav className="component-library-nav" aria-label="Администрирование"><Link href="/admin/links">Активные ссылки</Link><form action="/api/admin/logout" method="post"><button type="submit">Выйти</button></form></nav>
      </header>

      <section className="component-library-section" aria-labelledby="tokens-heading">
        <div className="component-section-heading"><p className="eyebrow">tokens</p><h2 id="tokens-heading">Цвета и поверхности</h2></div>
        <div className="token-grid">{colorTokens.map(([name, value, label]) => <article className="token-card" key={name}><span className="token-swatch" style={{ background: `var(${name})` }} aria-hidden="true" /><div><code>{name}</code><strong>{label}</strong><small>{value}</small></div></article>)}</div>
      </section>

      <section className="component-library-section" aria-labelledby="type-heading">
        <div className="component-section-heading"><p className="eyebrow">typography</p><h2 id="type-heading">Типографика</h2></div>
        <div className="type-specimens"><article><code>display_heading</code><p className="type-display">Заметки без шума</p><small>Georgia · заголовок страницы</small></article><article><code>body_text</code><p className="type-body">Читаемый текст для описаний, заметок и безопасных пояснений интерфейса.</p><small>Arial · основной текст</small></article><article><code>mono_label</code><p className="type-mono">--accent / active-link</p><small>ui-monospace · метки и технические значения</small></article></div>
      </section>

      <section className="component-library-section" aria-labelledby="components-heading">
        <div className="component-section-heading"><p className="eyebrow">components</p><h2 id="components-heading">Состояния компонентов</h2></div>
        <div className="component-showcase">{components.map((component) => <article className="component-sample" key={component.name}><header><code>{component.name}</code><p>{component.description}</p></header><div className="component-preview">{component.preview}</div></article>)}</div>
      </section>
    </section>
  </main>;
}
