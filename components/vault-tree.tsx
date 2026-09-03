"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
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
  const visibleNotes = topic === "all" ? topicNotes : topicNotes.filter((note) => note.topic === topic);
  const tree = buildTree(visibleNotes);
  return (
    <aside className="vault-sidebar">
      <div className="vault-sidebar-header">
        <Link href="/" className="vault-logo"><span>v</span><strong>vcobs</strong></Link>
        <span className="vault-count">{visibleNotes.length}</span>
      </div>
      <div className="topic-filter">
        <label htmlFor="vcobs-topic">Топик</label>
        <select id="vcobs-topic" value={topic} onChange={(event) => setTopic(event.target.value)}>
          <option value="all">Все топики</option>
          {topics.map((value) => <option value={value} key={value}>{value}</option>)}
        </select>
      </div>
      <p className="vault-label">Файлы</p>
      <nav className="vault-tree" aria-label="Опубликованные заметки по папкам">
        <TreeBranch node={tree} activeSlug={activeSlug} />
        {!visibleNotes.length && <p className="vault-empty">В этом топике нет файлов</p>}
      </nav>
    </aside>
  );
}
