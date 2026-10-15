import assert from "node:assert/strict";
import test from "node:test";
import { isSupportedDocument, parseDocument } from "../src/services/document-parser.ts";

const bytes = (text: string) => new TextEncoder().encode(text);

test("accepts plain text documents only", () => {
  assert.equal(isSupportedDocument("notes.md"), true);
  assert.equal(isSupportedDocument("DATA.CSV"), true);
  assert.equal(isSupportedDocument("lore.json"), true);
  assert.equal(isSupportedDocument("paper.pdf"), false);
  assert.equal(isSupportedDocument("notes.docx"), false);
  assert.equal(isSupportedDocument("no-extension"), false);
});

test("decodes text documents as UTF-8", async () => {
  assert.equal(await parseDocument(bytes("你好，世界"), "a.txt"), "你好，世界");
});

test("rejects binary formats instead of decoding them as text", async () => {
  await assert.rejects(parseDocument(bytes("%PDF-1.7"), "paper.pdf"), /不支持的文件类型/);
});
