import type { ModelConfig } from "@/types";
import type { ContextMessage } from "./context-service";

export interface ChatCompletionRequestBodyOptions {
  model: string;
  messages: ContextMessage[];
  modelConfig: ModelConfig;
}

export function buildChatCompletionRequestBody({
  model,
  messages,
  modelConfig,
}: ChatCompletionRequestBodyOptions): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: modelConfig.temperature,
    max_tokens: modelConfig.maxTokens,
    top_p: modelConfig.topP,
    frequency_penalty: modelConfig.frequencyPenalty,
    presence_penalty: modelConfig.presencePenalty,
    stream: true,
  };

  if (modelConfig.reasoningEffort) {
    body.reasoning_effort = modelConfig.reasoningEffort;
  }

  return body;
}
