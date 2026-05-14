import assert from "node:assert/strict";
import test from "node:test";
import { attachmentBytesToData, dataUrlToBytes } from "../src/services/attachment-data.ts";
import type { Attachment } from "../src/types/node.ts";

test("converts frozen image attachment bytes without mutating attachment", () => {
  const attachment = Object.freeze({
    id: "att-1",
    type: "image",
    filename: "sample.png",
    mimeType: "image/png",
    filePath: "conv-1/att-1.png",
    size: 3,
  } satisfies Attachment);

  const data = attachmentBytesToData(attachment, new Uint8Array([1, 2, 3]));

  assert.equal(data, "data:image/png;base64,AQID");
  assert.equal("data" in attachment, false);
});

test("decodes data URL payload bytes", () => {
  assert.deepEqual(
    Array.from(dataUrlToBytes("data:image/png;base64,AQID")),
    [1, 2, 3]
  );
});

