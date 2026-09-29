import assert from "node:assert/strict";
import test from "node:test";
import { EditorState, Transaction } from "@codemirror/state";
import { history, undo } from "@codemirror/commands";
import { externalPreviewReplacement, isExternalPreviewUpdate, PreviewContextCache, shouldReportPreviewChange } from "../lib/live-preview-state.ts";

test("external controlled value replacement is excluded from undo and change callbacks", () => {
  let state = EditorState.create({ doc: "first note", extensions: [history()] });
  const replacement = state.update(externalPreviewReplacement(state, "second note"));
  assert.equal(replacement.annotation(Transaction.addToHistory), false);
  assert.equal(isExternalPreviewUpdate(replacement), true);
  assert.equal(shouldReportPreviewChange([replacement]), false);
  state = replacement.state;
  assert.equal(state.doc.toString(), "second note");
  const userEdit = state.update({ changes: { from: state.doc.length, insert: "!" } });
  assert.equal(shouldReportPreviewChange([userEdit]), true);
  let undoDispatches = 0;
  const view = { get state() { return state; }, dispatch(transaction: Parameters<EditorState["update"]>[0]) { undoDispatches++; state = state.update(transaction).state; } };
  assert.equal(undo(view), false);
  assert.equal(undoDispatches, 0);
  assert.equal(state.doc.toString(), "second note");
});

test("block context cache invalidates from an edit without changing document source", () => {
  const source = Array.from({ length: 30000 }, (_, index) => index === 100 ? "```" : index === 200 ? "```" : `line ${index}`).join("\n");
  let state = EditorState.create({ doc: source });
  const cache = new PreviewContextCache(state);
  assert.equal(cache.before(150).fence?.marker, "`");
  assert.equal(cache.before(250).fence, null);
  const changed = state.doc.line(101);
  state = state.update({ changes: { from: changed.from, to: changed.to, insert: "plain" } }).state;
  cache.update(state, changed.from);
  assert.equal(cache.before(150).fence, null);
  assert.equal(cache.before(250).fence?.marker, "`");
  assert.equal(state.doc.lines, 30000);
  assert.equal(state.doc.line(101).text, "plain");
  cache.before(29900);
  const nearEnd = state.doc.line(29850);
  state = state.update({ changes: { from: nearEnd.to, insert: "!" } }).state;
  cache.update(state, nearEnd.to);
  const scanned = cache.scannedLines;
  cache.before(29900);
  assert.ok(cache.scannedLines - scanned < 128, "nearby edits should not rescan the full document");
});
