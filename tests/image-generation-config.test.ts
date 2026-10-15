import assert from "node:assert/strict";
import test from "node:test";
import { getImageGenerationConfig } from "../src/services/image-generation-utils.ts";

const provider = { apiUrl: "https://api.example.com/v1", apiKey: "sk-chat", defaultModel: "chat-model" };

test("image generation is off unless the provider enables it", () => {
  assert.equal(getImageGenerationConfig(provider), null);
});

test("enabled image generation falls back to the chat endpoint and key", () => {
  assert.deepEqual(
    getImageGenerationConfig({ ...provider, imageGeneration: { model: "dall-e-3", size: "1024x1024" } }),
    { apiUrl: provider.apiUrl, apiKey: "sk-chat", model: "dall-e-3", size: "1024x1024" }
  );
});

test("enabled image generation can use its own endpoint and key", () => {
  const config = getImageGenerationConfig({
    ...provider,
    imageGeneration: { model: "img", size: "512x512", apiUrl: " https://img.example.com/v1 ", apiKey: " sk-img " },
  });
  assert.equal(config?.apiUrl, "https://img.example.com/v1");
  assert.equal(config?.apiKey, "sk-img");
});
