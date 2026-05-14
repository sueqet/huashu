import assert from "node:assert/strict";
import test from "node:test";
import { getAttachmentPreviewKind } from "../src/services/attachment-preview.ts";

test("uses image preview for image attachments", () => {
  assert.equal(getAttachmentPreviewKind("image", "photo.jpg", "image/jpeg"), "image");
});

test("uses specific document preview kinds for pdf and docx", () => {
  assert.equal(getAttachmentPreviewKind("document", "paper.pdf", "application/pdf"), "pdf");
  assert.equal(
    getAttachmentPreviewKind(
      "document",
      "notes.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ),
    "docx"
  );
});

test("falls back to text preview for textual document types", () => {
  assert.equal(getAttachmentPreviewKind("document", "notes.md", "text/markdown"), "text");
  assert.equal(getAttachmentPreviewKind("document", "data.csv", "text/csv"), "text");
});

