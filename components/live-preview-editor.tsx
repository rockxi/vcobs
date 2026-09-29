"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { Decoration, DecorationSet, EditorView, keymap, placeholder as editorPlaceholder, ViewPlugin, ViewUpdate, WidgetType } from "@codemirror/view";
import { isPreviewTableSeparator, parsePreviewLine, previewMediaUrl, previewTableRow, splitPreviewTableRow, type PreviewToken } from "@/lib/live-preview-markdown";
import { externalPreviewReplacement, PreviewContextCache, shouldReportPreviewChange } from "@/lib/live-preview-state";
import styles from "./live-preview-editor.module.css";

export type LivePreviewEditorRef = { focus: () => void; getEditorView: () => EditorView | null };
export type LivePreviewEditorProps = {
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
  className?: string;
  placeholder?: string;
  /** A new ID recreates editor state, including the undo stack and selection. */
  documentId?: string;
  notePath?: string;
};

class MediaWidget extends WidgetType {
  constructor(readonly reference: string, readonly alt: string, readonly notePath: string, readonly obsidianEmbed: boolean) { super(); }
  eq(other: MediaWidget) { return this.reference === other.reference && this.alt === other.alt && this.notePath === other.notePath && this.obsidianEmbed === other.obsidianEmbed; }
  toDOM() {
    const url = previewMediaUrl(this.notePath, this.reference, this.obsidianEmbed);
    if (!url) {
      const fallback = document.createElement("span");
      fallback.className = styles.embedFallback;
      fallback.textContent = `Вложение: ${this.reference}`;
      return fallback;
    }
    const image = document.createElement("img");
    image.className = styles.image;
    image.src = url;
    image.alt = this.alt || this.reference.split("/").at(-1) || "Изображение";
    image.loading = "lazy";
    image.addEventListener("error", () => {
      const fallback = document.createElement("span");
      fallback.className = styles.embedFallback;
      fallback.textContent = `Изображение недоступно: ${this.reference}`;
      image.replaceWith(fallback);
    });
    return image;
  }
}

class TableRowWidget extends WidgetType {
  constructor(readonly cells: string[], readonly header: boolean) { super(); }
  eq(other: TableRowWidget) { return this.header === other.header && this.cells.join("\0") === other.cells.join("\0"); }
  toDOM() {
    const row = document.createElement("span");
    row.className = `${styles.tableRow} ${this.header ? styles.tableHeader : ""}`;
    row.style.gridTemplateColumns = `repeat(${this.cells.length}, minmax(0, 1fr))`;
    for (const value of this.cells) {
      const cell = document.createElement("span");
      cell.className = styles.tableCell;
      cell.textContent = value;
      row.append(cell);
    }
    return row;
  }
}

class TextWidget extends WidgetType {
  constructor(readonly text: string, readonly className: string) { super(); }
  eq(other: TextWidget) { return this.text === other.text && this.className === other.className; }
  toDOM() {
    const span = document.createElement("span");
    span.className = this.className;
    span.textContent = this.text;
    span.setAttribute("aria-hidden", "true");
    return span;
  }
}

class CheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean, readonly sourcePosition: number) { super(); }
  eq(other: CheckboxWidget) { return this.checked === other.checked && this.sourcePosition === other.sourcePosition; }
  toDOM(view: EditorView) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = styles.checkbox;
    button.setAttribute("role", "checkbox");
    button.setAttribute("aria-checked", String(this.checked));
    button.setAttribute("aria-label", this.checked ? "Mark task incomplete" : "Mark task complete");
    button.textContent = this.checked ? "☑" : "□";
    button.addEventListener("click", () => {
      view.dispatch({ changes: { from: this.sourcePosition + 1, to: this.sourcePosition + 2, insert: this.checked ? " " : "x" } });
      view.focus();
    });
    return button;
  }
  ignoreEvent() { return true; }
}

function tokenDecoration(token: PreviewToken, start: number, notePath: string): { from: number; to: number; value: Decoration } {
  const from = start + token.from;
  const to = start + token.to;
  if (token.kind === "hide" || token.kind === "fence") {
    return { from, to, value: Decoration.replace({}) };
  }
  if (token.kind === "image" || token.kind === "embed") {
    const [reference, alt = ""] = (token.text ?? "").split("\n", 2);
    return { from, to, value: Decoration.replace({ widget: new MediaWidget(reference, alt, notePath, token.kind === "embed") }) };
  }
  if (token.kind === "bullet") {
    return { from, to, value: Decoration.replace({ widget: new TextWidget("• ", styles.bullet) }) };
  }
  if (token.kind === "ordered") {
    return { from, to, value: Decoration.replace({ widget: new TextWidget(token.text ?? "", styles.bullet) }) };
  }
  if (token.kind === "rule") {
    return { from, to, value: Decoration.replace({ widget: new TextWidget("", styles.rule) }) };
  }
  if (token.kind === "frontmatter-delimiter") {
    return { from, to, value: Decoration.replace({ widget: new TextWidget(token.text ?? "", styles.frontmatter) }) };
  }
  if (token.kind === "checkbox-empty" || token.kind === "checkbox-checked") {
    const checked = token.kind === "checkbox-checked";
    return { from, to, value: Decoration.replace({ widget: new CheckboxWidget(checked, from) }) };
  }
  const className = styles[token.kind as keyof typeof styles];
  return { from, to, value: Decoration.mark({ class: className }) };
}

function previewDecorations(view: EditorView, contexts: PreviewContextCache, notePath: string): DecorationSet {
  const activeLine = view.state.doc.lineAt(view.state.selection.main.head).number;
  const ranges: { from: number; to: number; value: Decoration }[] = [];
  const seen = new Set<number>();
  for (const visible of view.visibleRanges) {
    const first = view.state.doc.lineAt(visible.from).number;
    const last = view.state.doc.lineAt(visible.to).number;
    for (let number = first; number <= last; number++) {
      if (seen.has(number)) continue;
      seen.add(number);
      const line = view.state.doc.line(number);
      const parsed = parsePreviewLine(line.text, number === activeLine, contexts.before(number));
      const previous = number > 1 ? view.state.doc.line(number - 1).text : "";
      const next = number < view.state.doc.lines ? view.state.doc.line(number + 1).text : "";
      let table = previewTableRow(previous, line.text, next);
      if (!table && splitPreviewTableRow(line.text)) {
        for (let lookback = number - 1; lookback > Math.max(0, number - 100); lookback--) {
          const candidate = view.state.doc.line(lookback).text;
          if (!candidate.trim() || !splitPreviewTableRow(candidate)) break;
          if (isPreviewTableSeparator(candidate)) {
            const header = lookback > 1 ? splitPreviewTableRow(view.state.doc.line(lookback - 1).text) : null;
            const cells = splitPreviewTableRow(line.text)!;
            if (header && header.length === cells.length && !isPreviewTableSeparator(view.state.doc.line(lookback - 1).text)) table = { cells, header: false, separator: false };
            break;
          }
        }
      }
      if (number !== activeLine && !parsed.context.fence && !parsed.context.frontmatter && table) {
        ranges.push({ from: line.from, to: line.to, value: Decoration.replace({ widget: table.separator ? new TextWidget("", styles.tableSeparator) : new TableRowWidget(table.cells, table.header) }) });
      } else for (const token of parsed.tokens) ranges.push(tokenDecoration(token, line.from, notePath));
    }
  }
  return Decoration.set(ranges.map(({ from, to, value }) => value.range(from, to)), true);
}

const livePreview = (notePath: string) => ViewPlugin.fromClass(class {
  decorations: DecorationSet;
  contexts: PreviewContextCache;
  constructor(view: EditorView) { this.contexts = new PreviewContextCache(view.state); this.decorations = previewDecorations(view, this.contexts, notePath); }
  update(update: ViewUpdate) {
    if (update.docChanged) {
      let first = update.startState.doc.length;
      update.changes.iterChangedRanges((fromA) => { first = Math.min(first, fromA); });
      this.contexts.update(update.state, first);
    }
    if (update.docChanged || update.selectionSet || update.viewportChanged) this.decorations = previewDecorations(update.view, this.contexts, notePath);
  }
}, { decorations: (plugin) => plugin.decorations });

/** Controlled Markdown editor. onChange receives unchanged Markdown source, including frontmatter. */
export const LivePreviewEditor = forwardRef<LivePreviewEditorRef, LivePreviewEditorProps>(function LivePreviewEditor(
  { value, onChange, ariaLabel = "Markdown editor", className, placeholder, documentId, notePath = "" }, ref,
) {
  const host = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useImperativeHandle(ref, () => ({
    focus: () => viewRef.current?.focus(),
    getEditorView: () => viewRef.current,
  }), []);

  useEffect(() => {
    if (!host.current) return;
    const view = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          EditorView.lineWrapping,
          ...(placeholder ? [editorPlaceholder(placeholder)] : []),
          EditorView.contentAttributes.of({ "aria-label": ariaLabel, role: "textbox", "aria-multiline": "true", spellcheck: "true" }),
          EditorView.updateListener.of((update) => {
            if (shouldReportPreviewChange(update.transactions)) {
              onChangeRef.current(update.state.doc.toString());
            }
          }),
          livePreview(notePath),
        ],
      }),
    });
    viewRef.current = view;
    return () => { viewRef.current = null; view.destroy(); };
    // The view is intentionally kept stable so focus, selection, and undo survive prop updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) view.dispatch(externalPreviewReplacement(view.state, value));
  }, [value]);

  return <div className={`${styles.editor} ${className ?? ""}`} data-placeholder={placeholder} ref={host} />;
});
