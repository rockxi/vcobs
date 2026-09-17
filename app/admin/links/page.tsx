import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AdminPasteControls } from "@/components/admin-paste-controls";
import { formatSharedFileSize } from "@/components/file-share-utils";
import { ADMIN_SESSION_COOKIE, validateAdminSession } from "@/lib/admin-auth";
import { listActivePastes } from "@/lib/pastes";
import { listActiveSharedFiles } from "@/lib/shared-files";

export const dynamic = "force-dynamic";
const date = (value: string) => new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

export default async function AdminLinksPage() {
  if (!validateAdminSession((await cookies()).get(ADMIN_SESSION_COOKIE)?.value)) redirect("/admin");
  const [pastes, files] = await Promise.all([listActivePastes(), listActiveSharedFiles()]);
  return <main className="admin-shell"><section className="admin-inventory">
    <header className="admin-inventory-header"><div><p className="eyebrow">vcobs · администрирование</p><h1>Активные ссылки</h1><p>Только метаданные. Содержимое заметок здесь не передаётся.</p></div><form action="/api/admin/logout" method="post"><button type="submit">Выйти</button></form></header>
    <div className="admin-counts"><span>Заметки <b>{pastes.length}</b></span><span>Файлы <b>{files.length}</b></span></div>
    <section className="admin-section"><div className="admin-section-title"><h2>Заметки</h2><span>{pastes.length}</span></div>{pastes.length ? <div className="admin-list">{pastes.map((paste) => <article className="admin-record" key={paste.slug}><div className="admin-record-heading"><Link href={`/${paste.slug}`}><code>{paste.slug}</code></Link><span className={paste.editable ? "admin-status editable" : "admin-status"}>{paste.editable ? "редактирование" : "только чтение"}</span></div><dl><div><dt>Создана</dt><dd>{date(paste.createdAt)}</dd></div><div><dt>Истекает</dt><dd>{date(paste.expiresAt)}</dd></div><div><dt>Длина</dt><dd>{paste.length.toLocaleString("ru-RU")} симв.</dd></div></dl><Link className="admin-public-link" href={`/${paste.slug}`}>Открыть публичную страницу →</Link><AdminPasteControls slug={paste.slug} editable={paste.editable} /></article>)}</div> : <div className="admin-empty"><p>Активных заметок пока нет.</p></div>}</section>
    <section className="admin-section"><div className="admin-section-title"><h2>Файлы</h2><span>{files.length}</span></div>{files.length ? <div className="admin-list">{files.map((file) => <article className="admin-record" key={file.slug}><div className="admin-record-heading"><Link href={`/${file.slug}`}><code>{file.slug}</code></Link><span className="admin-status">файл</span></div><h3 title={file.fileName}>{file.fileName}</h3><dl><div><dt>Тип</dt><dd>{file.contentType}</dd></div><div><dt>Размер</dt><dd>{formatSharedFileSize(file.size)}</dd></div><div><dt>Создан</dt><dd>{date(file.createdAt)}</dd></div><div><dt>Истекает</dt><dd>{date(file.expiresAt)}</dd></div></dl><Link className="admin-public-link" href={`/${file.slug}`}>Открыть публичную страницу →</Link></article>)}</div> : <div className="admin-empty"><p>Активных файлов пока нет.</p></div>}</section>
  </section></main>;
}
