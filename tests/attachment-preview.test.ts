import assert from "node:assert/strict";
import test from "node:test";
import { getAttachmentPreviewKind } from "../src/services/attachment-preview.ts";

test("images preview as images, everything else as text", () => {
  assert.equal(getAttachmentPreviewKind("image"), "image");
  assert.equal(getAttachmentPreviewKind("document"), "text");
});
