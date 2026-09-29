import assert from "node:assert/strict";
import test from "node:test";
import { initialPreviewContext, isPreviewTableSeparator, parsePreviewLine, previewMediaUrl, previewTableRow } from "../lib/live-preview-markdown.ts";

test("reveals exact source on the caret line", () => {
  assert.deepEqual(parsePreviewLine("## **Title** [link](url)", true).tokens, []);
});

test("renders heading and inline emphasis without changing source offsets", () => {
  const source = "## A **bold** and *soft* word";
  const tokens = parsePreviewLine(source, false).tokens;
  assert.deepEqual(tokens.map((token) => [source.slice(token.from, token.to), token.kind]), [
    ["## ", "hide"], ["A **bold** and *soft* word", "heading-2"],
    ["**", "hide"], ["bold", "bold"], ["**", "hide"],
    ["*", "hide"], ["soft", "italic"], ["*", "hide"],
  ]);
});

test("renders list and task markers, links, code and strike", () => {
  const source = "- [x] [visit](https://example.com) `code` ~~old~~";
  const kinds = parsePreviewLine(source, false).tokens.map((token) => token.kind);
  assert.ok(kinds.includes("bullet"));
  assert.ok(kinds.includes("checkbox-checked"));
  assert.ok(kinds.includes("link"));
  assert.ok(kinds.includes("code"));
  assert.ok(kinds.includes("strike"));
  assert.equal(parsePreviewLine("1. [ ] todo", false).tokens[1].kind, "checkbox-empty");
  assert.deepEqual(parsePreviewLine("12. ordered", false).tokens[0], { from: 0, to: 4, kind: "ordered", text: "12. " });
});

test("fenced code closes only with the same marker and sufficient length", () => {
  const open = parsePreviewLine("````ts", false);
  assert.deepEqual(open.context.fence, { marker: "`", length: 4 });
  const wrongMarker = parsePreviewLine("~~~~", false, open.context);
  assert.deepEqual(wrongMarker.context.fence, open.context.fence);
  const tooShort = parsePreviewLine("```", false, wrongMarker.context);
  assert.deepEqual(tooShort.context.fence, open.context.fence);
  assert.deepEqual(parsePreviewLine("**literal**", false, tooShort.context).tokens.map((token) => token.kind), ["code-block"]);
  assert.equal(parsePreviewLine("````", false, tooShort.context).context.fence, null);
});

test("inactive horizontal rules and frontmatter delimiters become visual elements", () => {
  const opening = parsePreviewLine("---", false, initialPreviewContext);
  assert.equal(opening.tokens[0].kind, "frontmatter-delimiter");
  assert.equal(opening.context.frontmatter, true);
  const property = parsePreviewLine("title: Note", false, opening.context);
  assert.deepEqual(property.tokens, []);
  const closing = parsePreviewLine("---", false, property.context);
  assert.equal(closing.tokens[0].kind, "frontmatter-delimiter");
  assert.equal(closing.context.frontmatter, false);
  assert.equal(parsePreviewLine("---", false, closing.context).tokens[0].kind, "rule");
  assert.deepEqual(parsePreviewLine("***", true, closing.context).tokens, []);
});

test("unmatched syntax and frontmatter stay editable as source", () => {
  assert.deepEqual(parsePreviewLine("broken **bold and [link](", false).tokens, []);
  assert.deepEqual(parsePreviewLine("vcobs-link: demo", false).tokens, []);
});

test("images and Obsidian embeds retain exact source offsets on inactive lines", () => {
  const source = "Before ![diagram](assets/one.png) and ![[other.pdf]]";
  const images = parsePreviewLine(source, false).tokens.filter((token) => token.kind === "image" || token.kind === "embed");
  assert.deepEqual(images.map((token) => source.slice(token.from, token.to)), ["![diagram](assets/one.png)", "![[other.pdf]]"]);
  assert.deepEqual(images.map((token) => token.kind), ["image", "embed"]);
  assert.deepEqual(parsePreviewLine(source, true).tokens, []);
  assert.equal(previewMediaUrl("Notes/a.md", "../assets/one.png"), "/api/admin/vault/media/assets/one.png");
  assert.equal(previewMediaUrl("Notes/a.md", "other.pdf"), null);
  assert.equal(previewMediaUrl("Notes/a.md", "../../secret.png"), null);
  assert.equal(previewMediaUrl("Notes/a.md", "https://elsewhere/image.png"), null);
  assert.equal(previewMediaUrl("Notes/a.md", "image.png", true), "/api/admin/vault/media/Notes/image.png?obsidian=1");
  assert.equal(previewMediaUrl("Notes/a.md", "Assets/image.png", true), "/api/admin/vault/media/Notes/Assets/image.png");
});

test("GFM table rows identify header, separator and cells", () => {
  assert.equal(isPreviewTableSeparator("| --- | :---: |"), true);
  assert.deepEqual(previewTableRow("", "| First | Second |", "| --- | --- |"), { cells: ["First", "Second"], header: true, separator: false });
  assert.deepEqual(previewTableRow("| First | Second |", "| --- | --- |", "| A | B |"), { cells: ["---", "---"], header: false, separator: true });
  assert.deepEqual(previewTableRow("| --- | --- |", "| A | B |", ""), { cells: ["A", "B"], header: false, separator: false });
});

test("table delimiters require a header and one-column tables are supported", () => {
  assert.equal(previewTableRow("", "| --- | --- |", ""), null);
  assert.equal(previewTableRow("", "| --- | --- |", "| A | B |"), null);
  assert.deepEqual(previewTableRow("", "| Heading |", "| --- |"), { cells: ["Heading"], header: true, separator: false });
  assert.deepEqual(previewTableRow("| Heading |", "| --- |", "| Cell |"), { cells: ["---"], header: false, separator: true });
  assert.deepEqual(previewTableRow("| --- |", "| Cell |", ""), { cells: ["Cell"], header: false, separator: false });
});
