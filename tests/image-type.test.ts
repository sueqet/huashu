import assert from "node:assert/strict";
import test from "node:test";
import { detectImageExtension } from "../src/lib/image-type.ts";

const bytes = (...values: number[]) => new Uint8Array(values);

test("detects image formats from magic bytes", () => {
  assert.equal(detectImageExtension(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a)), "png");
  assert.equal(detectImageExtension(bytes(0xff, 0xd8, 0xff, 0xe0)), "jpg");
  assert.equal(detectImageExtension(bytes(0x47, 0x49, 0x46, 0x38, 0x39, 0x61)), "gif");
  assert.equal(
    detectImageExtension(bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50)),
    "webp"
  );
});

test("returns null for non-images and short input", () => {
  assert.equal(detectImageExtension(new TextEncoder().encode("{\"name\":\"x\"}")), null);
  assert.equal(detectImageExtension(bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x41, 0x56, 0x49, 0x20)), null);
  assert.equal(detectImageExtension(bytes()), null);
});
