import assert from "node:assert/strict";
import test from "node:test";
import { isLocalImageSrc } from "../src/lib/attachment-utils.ts";

test("only data and blob image sources count as local", () => {
  assert.equal(isLocalImageSrc("data:image/png;base64,AAAA"), true);
  assert.equal(isLocalImageSrc("  DATA:image/jpeg;base64,AAAA"), true);
  assert.equal(isLocalImageSrc("blob:http://tauri.localhost/1234"), true);

  assert.equal(isLocalImageSrc("https://example.com/a.png"), false);
  assert.equal(isLocalImageSrc("http://192.168.1.2/a.png"), false);
  assert.equal(isLocalImageSrc("//example.com/a.png"), false);
  assert.equal(isLocalImageSrc("data:text/html,<b>x</b>"), false);
  assert.equal(isLocalImageSrc(undefined), false);
});
