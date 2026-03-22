import type { ContextMessage } from "./context-service";
import type { ModelConfig } from "@/types";

export interface StreamCallbacks {
  onToken: (token: string) => void;
  onDone: (fullContent: string) => void;
  onError: (error: Error) => void;
}

interface ChatCompletionOptions {
  apiUrl: string;
  apiKey: string;
  model: string;
  messages: ContextMessage[];
  modelConfig: ModelConfig;
  signal?: AbortSignal;
  callbacks: StreamCallbacks;
}

/**
 * OpenAI 兼容的流式 AI 调用服务
 * 支持所有兼容 OpenAI Chat Completions API 的厂商
 */
export async function streamChatCompletion(
  options: ChatCompletionOptions
): Promise<void> {
  const { apiUrl, apiKey, model, messages, modelConfig, signal, callbacks } =
    options;

  const url = apiUrl.endsWith("/")
    ? `${apiUrl}chat/completions`
    : `${apiUrl}/chat/completions`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: modelConfig.temperature,
        max_tokens: modelConfig.maxTokens,
        top_p: modelConfig.topP,
        frequency_penalty: modelConfig.frequencyPenalty,
        presence_penalty: modelConfig.presencePenalty,
        stream: true,
      }),
      signal,
    });
  } catch (err) {
    if (signal?.aborted) return;
    callbacks.onError(
      err instanceof Error ? err : new Error("网络请求失败")
    );
    return;
  }

  if (!response.ok) {
    let errorMsg = `API 错误: ${response.status}`;
    try {
      const errorBody = await response.json();
      errorMsg =
        errorBody.error?.message || errorBody.message || errorMsg;
    } catch {
      // ignore parse error
    }
    callbacks.onError(new Error(errorMsg));
    return;
  }

  // 读取 SSE 流
  const reader = response.body?.getReader();
  if (!reader) {
    callbacks.onError(new Error("无法读取响应流"));
    return;
  }

  const decoder = new TextDecoder();
  let fullContent = "";
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      // 保留最后一行（可能不完整）
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;

        const data = trimmed.slice(6);
        if (data === "[DONE]") {
          callbacks.onDone(fullContent);
          return;
        }

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            fullContent += delta;
            callbacks.onToken(delta);
          }
        } catch {
          // 忽略解析错误，继续处理下一行
        }
      }
    }

    // 流结束但没收到 [DONE]
    callbacks.onDone(fullContent);
  } catch (err) {
    if (signal?.aborted) {
      callbacks.onDone(fullContent);
      return;
    }
    callbacks.onError(
      err instanceof Error ? err : new Error("流读取错误")
    );
  }
}
