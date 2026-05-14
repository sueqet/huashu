import assert from "node:assert/strict";
import test from "node:test";
import {
  getGeneratedImageMetadata,
  normalizeImageSize,
} from "../src/services/image-generation-utils.ts";

test("normalizes valid custom image sizes", () => {
  assert.equal(normalizeImageSize(" 768 x 1344 "), "768x1344");
});

test("falls back when image size is invalid", () => {
  assert.equal(normalizeImageSize("wide"), "1024x1024");
  assert.equal(normalizeImageSize("0x1024"), "1024x1024");
});

test("detects generated image mime and extension from data URL", () => {
  const metadata = getGeneratedImageMetadata(
    "data:image/webp;base64,QUJDRA==",
    1234567890
  );

  assert.deepEqual(metadata, {
    mimeType: "image/webp",
    extension: "webp",
    filename: "generated_1234567890.webp",
    size: 4,
  });
});

test("uses png metadata when data URL metadata is missing", () => {
  const metadata = getGeneratedImageMetadata("not-a-data-url", 1234567890);

  assert.deepEqual(metadata, {
    mimeType: "image/png",
    extension: "png",
    filename: "generated_1234567890.png",
    size: 0,
  });
});
