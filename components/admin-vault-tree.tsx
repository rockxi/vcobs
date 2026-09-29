"use client";

import { useMemo, useState } from "react";

export type VaultEntry = { id: string; path: string; mtime?: number; type?: string };
type Branch = { folders: Map<string, Branch>; files: VaultEntry[] };

export function buildVaultTree(entries: VaultEntry[]): Branch {
  const root: Branch = { folders: new Map(), files: [] };
  for (const entry of entries) {
    const parts = entry.path.replaceAll("\\", "/").split("/").filter(Boolean);
    if (!parts.length) continue;
    let branch = root;
    for (const part of parts.slice(0, -1)) {
      if (!branch.folders.has(part)) branch.folders.set(part, { folders: new Map(), files: [] });
      branch = branch.folders.get(part)!;
    }
    branch.files.push(entry);
  }
  return root;
}

function BranchView({ branch, prefix, depth, activeId, onSelect }: { branch: Branch; prefix: string; depth: number; activeId: string | null; onSelect: (entry: VaultEntry) => void }) {
  return <>
    {[...branch.folders].sort(([a], [b]) => a.localeCompare(b, "ru")).map(([name, child]) => {
      const path = `${prefix}${name}/`;
      return <details className="admin-vault-folder" key={path} open>
        <summary style={{ paddingInlineStart: `${14 + depth * 15}px` }}><span aria-hidden="true">▸</span> {name}</summary>
        <BranchView branch={child} prefix={path} depth={depth + 1} activeId={activeId} onSelect={onSelect} />
      </details>;
    })}
    {[...branch.files].sort((a, b) => a.path.localeCompare(b.path, "ru")).map((entry) => <button
      type="button" className="admin-vault-file" aria-current={entry.id === activeId ? "page" : undefined}
      key={entry.id} title={entry.path} onClick={() => onSelect(entry)}
      style={{ paddingInlineStart: `${30 + depth * 15}px` }}
    ><span aria-hidden="true">◇</span><span>{entry.path.replaceAll("\\", "/").split("/").at(-1)?.replace(/\.md$/i, "")}</span></button>)}
  </>;
}

export function AdminVaultTree({ entries, activeId, onSelect }: { entries: VaultEntry[]; activeId: string | null; onSelect: (entry: VaultEntry) => void }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => entries.filter((entry) => entry.path.toLocaleLowerCase("ru").includes(query.trim().toLocaleLowerCase("ru"))), [entries, query]);
  const tree = useMemo(() => buildVaultTree(filtered), [filtered]);
  return <>
    <label className="admin-vault-search"><span className="sr-only">Поиск заметок</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по файлам…" /></label>
    <p className="admin-vault-tree-label">Файлы <span>{filtered.length}</span></p>
    <nav className="admin-vault-tree" aria-label="Все заметки по папкам">
      {filtered.length ? <BranchView branch={tree} prefix="" depth={0} activeId={activeId} onSelect={onSelect} /> : <p className="admin-vault-tree-empty">{entries.length ? "Ничего не найдено" : "В хранилище нет заметок"}</p>}
    </nav>
  </>;
}
