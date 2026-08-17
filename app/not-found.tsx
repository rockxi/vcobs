import Link from "next/link";

export default function NotFound() {
  return (
    <main className="not-found">
      <span className="brand-mark">v</span>
      <p className="eyebrow">404 / private note</p>
      <h1>Эта заметка не опубликована</h1>
      <p>Возможно, ссылка неверна или в свойствах заметки нет <code>vcobs-link</code>.</p>
      <Link href="/">К списку заметок →</Link>
    </main>
  );
}
