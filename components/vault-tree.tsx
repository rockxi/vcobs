"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PublicNote } from "@/lib/couch";

type TreeNode = {
  folders: Map<string, TreeNode>;
  notes: PublicNote[];
};

function buildTree(notes: PublicNote[]) {
  const root: TreeNode = { folders: new Map(), notes: [] };

  for (const note of notes) {
    const parts = note.path.replaceAll("\\", "/").split("/").filter(Boolean);
    let node = root;
    for (const folder of parts.slice(0, -1)) {
      const next = node.folders.get(folder) ?? { folders: new Map(), notes: [] };
      node.folders.set(folder, next);
      node = next;
    }
    node.notes.push(note);
  }

  return root;
}

function TreeBranch({ node, depth = 0, activeSlug }: { node: TreeNode; depth?: number; activeSlug?: string }) {
  const folders = [...node.folders.entries()].sort(([a], [b]) => a.localeCompare(b, "ru"));
  const notes = [...node.notes].sort((a, b) => a.path.localeCompare(b.path, "ru"));

  return <>
    {folders.map(([name, child]) => (
      <details className="vault-folder" key={`${depth}-${name}`} open>
        <summary style={{ paddingLeft: `${12 + depth * 14}px` }}><span className="folder-chevron">›</span><span className="folder-icon">▱</span>{name}</summary>
        <TreeBranch node={child} depth={depth + 1} activeSlug={activeSlug} />
      </details>
    ))}
    {notes.map((note) => {
      const name = note.path.split("/").at(-1)?.replace(/\.md$/i, "") ?? note.slug;
      return <Link
        aria-current={note.slug === activeSlug ? "page" : undefined}
        className="vault-file"
        href={`/${note.slug}`}
        key={note.slug}
        style={{ paddingLeft: `${30 + depth * 14}px` }}
        title={note.path}
      ><span>◇</span>{name}</Link>;
    })}
  </>;
}

export function VaultTree({ notes, activeSlug }: { notes: PublicNote[]; activeSlug?: string }) {
  const topicNotes = useMemo(() => notes.filter((note) => note.topic), [notes]);
  const topics = useMemo(() => [...new Set(topicNotes.map((note) => note.topic!))].sort((a, b) => a.localeCompare(b, "ru")), [topicNotes]);
  const [topic, setTopic] = useState("all");
  const [topicMenuOpen, setTopicMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const topicFilterRef = useRef<HTMLDivElement>(null);
  useEffect(() => setCollapsed(localStorage.getItem("vcobs-sidebar") === "collapsed"), []);
  useEffect(() => {
    function closeTopicMenu(event: MouseEvent) {
      if (!topicFilterRef.current?.contains(event.target as Node)) setTopicMenuOpen(false);
    }
    function closeTopicMenuOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setTopicMenuOpen(false);
    }
    document.addEventListener("mousedown", closeTopicMenu);
    document.addEventListener("keydown", closeTopicMenuOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeTopicMenu);
      document.removeEventListener("keydown", closeTopicMenuOnEscape);
    };
  }, []);
  function toggleSidebar() {
    setCollapsed((current) => {
      const next = !current;
      localStorage.setItem("vcobs-sidebar", next ? "collapsed" : "open");
      return next;
    });
  }
  const visibleNotes = topic === "all" ? topicNotes : topicNotes.filter((note) => note.topic === topic);
  const tree = buildTree(visibleNotes);
  return (
    <aside className={`vault-sidebar${collapsed ? " vault-sidebar-collapsed" : ""}`}>
      <button className="vault-toggle" type="button" onClick={toggleSidebar} aria-label={collapsed ? "Показать боковое меню" : "Скрыть боковое меню"} aria-expanded={!collapsed} title={collapsed ? "Показать меню" : "Скрыть меню"}>{collapsed ? "›" : "‹"}</button>
      <div className="vault-sidebar-header">
        <Link href="/" className="vault-logo"><span>v</span><strong>vcobs</strong></Link>
        <span className="vault-count">{visibleNotes.length}</span>
      </div>
      <div
        className="topic-filter"
        ref={topicFilterRef}
        onMouseEnter={() => setTopicMenuOpen(true)}
        onMouseLeave={() => setTopicMenuOpen(false)}
        onFocusCapture={() => setTopicMenuOpen(true)}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setTopicMenuOpen(false);
        }}
      >
        <span className="topic-filter-label">Топик</span>
        <button className="topic-trigger" type="button" onClick={() => setTopicMenuOpen((open) => !open)} aria-haspopup="listbox" aria-expanded={topicMenuOpen}>
          <span className="topic-trigger-icon">✦</span>
          <span className="topic-trigger-value">{topic === "all" ? "Все топики" : topic}</span>
          <span className={`topic-trigger-chevron${topicMenuOpen ? " is-open" : ""}`}>⌄</span>
        </button>
        <div className={`topic-menu${topicMenuOpen ? " topic-menu-open" : ""}`} role="listbox" aria-label="Выбор топика" aria-hidden={!topicMenuOpen}>
          {["all", ...topics].map((value) => {
            const isAll = value === "all";
            const count = isAll ? topicNotes.length : topicNotes.filter((note) => note.topic === value).length;
            const selected = topic === value;
            return <button
              aria-selected={selected}
              className="topic-option"
              key={value}
              tabIndex={topicMenuOpen ? 0 : -1}
              onClick={() => { setTopic(value); setTopicMenuOpen(false); }}
              role="option"
              type="button"
            >
              <span className="topic-option-mark">{selected ? "✓" : ""}</span>
              <span>{isAll ? "Все топики" : value}</span>
              <span className="topic-option-count">{count}</span>
            </button>;
          })}
        </div>
      </div>
      <p className="vault-label">Файлы</p>
      <nav className="vault-tree" aria-label="Опубликованные заметки по папкам">
        <TreeBranch node={tree} activeSlug={activeSlug} />
        {!visibleNotes.length && <p className="vault-empty">В этом топике нет файлов</p>}
      </nav>
    </aside>
  );
}
