import assert from "node:assert/strict";
import test from "node:test";
import { countMessagesTokens, countTokens } from "../src/services/token-service.ts";

test("estimates ASCII at a quarter token per character", () => {
  assert.equal(countTokens("abcdefgh"), 2);
  assert.equal(countTokens("abc"), 1);
  assert.equal(countTokens(""), 0);
});

test("estimates CJK at 1.5 tokens per character", () => {
  assert.equal(countTokens("你好"), 3);
  assert.equal(countTokens("你好ab"), 4);
});

test("adds per-message overhead and fixed image cost", () => {
  assert.equal(countMessagesTokens([{ role: "user", content: "abcd" }]), 1 + 4 + 2);
  assert.equal(
    countMessagesTokens([
      {
        role: "user",
        content: [
          { type: "text", text: "abcd" },
          { type: "image_url", image_url: { url: "data:image/png;base64,AA" } },
        ],
      },
    ]),
    1 + 765 + 4 + 2
  );
});
