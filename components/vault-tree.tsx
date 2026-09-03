import Link from "next/link";
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
  const tree = buildTree(notes);
  return (
    <aside className="vault-sidebar">
      <div className="vault-sidebar-header">
        <Link href="/" className="vault-logo"><span>v</span><strong>vcobs</strong></Link>
        <span className="vault-count">{notes.length}</span>
      </div>
      <p className="vault-label">Файлы</p>
      <nav className="vault-tree" aria-label="Опубликованные заметки по папкам">
        <TreeBranch node={tree} activeSlug={activeSlug} />
      </nav>
    </aside>
  );
}
