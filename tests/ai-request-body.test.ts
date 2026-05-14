import assert from "node:assert/strict";
import test from "node:test";
import { buildChatCompletionRequestBody } from "../src/services/ai-request-body.ts";
import type { ModelConfig } from "../src/types/config.ts";

const baseConfig: ModelConfig = {
  temperature: 0.7,
  maxTokens: 4096,
  topP: 1,
  frequencyPenalty: 0,
  presencePenalty: 0,
};

test("serializes existing chat completion parameters", () => {
  const body = buildChatCompletionRequestBody({
    model: "gpt-5.2",
    messages: [{ role: "user", content: "Hello" }],
    modelConfig: baseConfig,
  });

  assert.deepEqual(body, {
    model: "gpt-5.2",
    messages: [{ role: "user", content: "Hello" }],
    temperature: 0.7,
    max_tokens: 4096,
    top_p: 1,
    frequency_penalty: 0,
    presence_penalty: 0,
    stream: true,
  });
});

test("omits reasoning_effort when reasoning effort is unset", () => {
  const body = buildChatCompletionRequestBody({
    model: "gpt-5.2",
    messages: [],
    modelConfig: baseConfig,
  });

  assert.equal("reasoning_effort" in body, false);
});

test("includes reasoning_effort when configured", () => {
  const body = buildChatCompletionRequestBody({
    model: "gpt-5.2",
    messages: [],
    modelConfig: {
      ...baseConfig,
      reasoningEffort: "high",
    },
  });

  assert.equal(body.reasoning_effort, "high");
});
