import { Annotation, EditorState, Transaction } from "@codemirror/state";
// @ts-expect-error Node's strip-types test runner requires the source extension.
import { initialPreviewContext, parsePreviewLine, type PreviewContext } from "./live-preview-markdown.ts";

/** Sparse block checkpoints. Edits discard only following checkpoints; nearby typing scans nearby lines. */
export class PreviewContextCache {
  private checkpoints = new Map<number, PreviewContext>([[0, initialPreviewContext]]);
  private state: EditorState;
  scannedLines = 0;
  constructor(state: EditorState) { this.state = state; }
  update(state: EditorState, changedFrom: number) {
    const first = this.state.doc.lineAt(Math.min(changedFrom, this.state.doc.length)).number;
    this.state = state;
    for (const line of this.checkpoints.keys()) if (line >= first) this.checkpoints.delete(line);
  }
  before(line: number): PreviewContext {
    let anchor = 0;
    for (const key of this.checkpoints.keys()) if (key < line && key > anchor) anchor = key;
    let context = this.checkpoints.get(anchor)!;
    for (let number = anchor + 1; number < line; number++) {
      this.scannedLines++;
      context = parsePreviewLine(this.state.doc.line(number).text, true, context).context;
      if (number % 128 === 0 || number === line - 1) this.checkpoints.set(number, context);
    }
    return context;
  }
}

export const externalPreviewUpdate = Annotation.define<boolean>();

/** Synchronize a controlled value without reporting it as an editor action. */
export function externalPreviewReplacement(state: EditorState, value: string) {
  return {
    changes: { from: 0, to: state.doc.length, insert: value },
    annotations: [Transaction.addToHistory.of(false), externalPreviewUpdate.of(true)],
  };
}

export function isExternalPreviewUpdate(transaction: Transaction): boolean {
  return transaction.annotation(externalPreviewUpdate) === true;
}

export function shouldReportPreviewChange(transactions: readonly Transaction[]): boolean {
  return transactions.some((transaction) => transaction.docChanged && !isExternalPreviewUpdate(transaction));
}
