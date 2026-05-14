import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveAttachmentDataPath,
  resolveAttachmentOriginalPath,
  resolveAttachmentTextPath,
} from "../src/services/attachment-paths.ts";
import type { Attachment } from "../src/types/node.ts";

const fileBackedImage: Attachment = {
  id: "att-1",
  type: "image",
  filename: "sample.png",
  mimeType: "image/png",
  filePath: "conv-1/att-1.png",
  size: 10,
};

test("resolves file-backed attachment data path", () => {
  assert.equal(
    resolveAttachmentDataPath("project-1", fileBackedImage),
    "projects/project-1/attachments/conv-1/att-1.png"
  );
});

test("resolves legacy attachment without filePath using filename extension", () => {
  const legacy = {
    ...fileBackedImage,
    filePath: "",
    filename: "legacy.jpeg",
  };

  assert.equal(
    resolveAttachmentDataPath("project-1", legacy),
    "projects/project-1/attachments/att-1.jpeg"
  );
});

test("resolves document original and extracted text paths independently", () => {
  const doc: Attachment = {
    id: "doc-1",
    type: "document",
    filename: "paper.pdf",
    mimeType: "application/pdf",
    filePath: "conv-1/doc-1.txt",
    originalFilePath: "conv-1/doc-1.pdf",
    textFilePath: "conv-1/doc-1.txt",
    size: 100,
  };

  assert.equal(
    resolveAttachmentOriginalPath("project-1", doc),
    "projects/project-1/attachments/conv-1/doc-1.pdf"
  );
  assert.equal(
    resolveAttachmentTextPath("project-1", doc),
    "projects/project-1/attachments/conv-1/doc-1.txt"
  );
});
