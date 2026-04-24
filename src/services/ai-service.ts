import type { ContextMessage } from "./context-service";
import {
  extractMimeTypeFromDataUrl,
  getSafeImageMimeType,
  isModelCompatibleImageMimeType,
  shouldTranscodeImageForModel,
} from "@/lib/attachment-utils";
import type { ModelConfig } from "@/types";

/** 内联图片数据（从多模态模型响应中解析） */
export interface InlineImageData {
  /** 图片 URL（data URL 或 HTTP URL） */
  url: string;
  /** 可选的图片描述 */
  alt?: string;
}

export interface StreamCallbacks {
  onToken: (token: string) => void;
  onDone: (fullContent: string) => void;
  onError: (error: Error) => void;
  /** 内联图片回调（多模态模型返回的图片） */
  onImage?: (image: InlineImageData) => void;
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

async function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("无法解码图片数据"));
    image.src = src;
  });
}

async function transcodeImageDataUrl(
  dataUrl: string,
  outputMimeType: string
): Promise<string> {
  const image = await loadImageElement(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("无法创建图片转换画布");
  }

  context.drawImage(image, 0, 0);

  const convertedUrl = canvas.toDataURL(outputMimeType);
  if (!convertedUrl.startsWith("data:")) {
    throw new Error("图片转换失败");
  }

  return convertedUrl;
}

async function prepareImageUrl(
  url: string,
  target: { apiUrl: string; model: string }
): Promise<string> {
  const mimeType = extractMimeTypeFromDataUrl(url);
  if (!mimeType) return url;

  if (isModelCompatibleImageMimeType(mimeType, target)) {
    return url;
  }

  if (!shouldTranscodeImageForModel(mimeType, target)) {
    return url;
  }

  return transcodeImageDataUrl(url, getSafeImageMimeType(mimeType));
}

async function prepareMessagesForApi(
  messages: ContextMessage[],
  target: { apiUrl: string; model: string }
): Promise<ContextMessage[]> {
  return Promise.all(
    messages.map(async (message) => {
      if (typeof message.content === "string") {
        return message;
      }

      const content = await Promise.all(
        message.content.map(async (part) => {
          if (part.type !== "image_url") {
            return part;
          }

          return {
            ...part,
            image_url: {
              ...part.image_url,
              url: await prepareImageUrl(part.image_url.url, target),
            },
          };
        })
      );

      return {
        ...message,
        content,
      };
    })
  );
}

/**
 * OpenAI 兼容的流式 AI 调用服务
 * 支持所有兼容 OpenAI Chat Completions API 的厂商
 * 支持多模态模型内联图片输出
 */
export async function streamChatCompletion(
  options: ChatCompletionOptions
): Promise<void> {
  const { apiUrl, apiKey, model, messages, modelConfig, signal, callbacks } =
    options;

  const url = apiUrl.endsWith("/")
    ? `${apiUrl}chat/completions`
    : `${apiUrl}/chat/completions`;
  let preparedMessages: ContextMessage[];

  try {
    preparedMessages = await prepareMessagesForApi(messages, { apiUrl, model });
  } catch (err) {
    callbacks.onError(
      err instanceof Error ? err : new Error("图片预处理失败")
    );
    return;
  }

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
        messages: preparedMessages,
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
          const choice = parsed.choices?.[0];
          if (!choice) continue;

          const delta = choice.delta;

          // 标准文本内容
          if (delta?.content && typeof delta.content === "string") {
            fullContent += delta.content;
            callbacks.onToken(delta.content);
          }

          // 多模态内联图片：delta.content 为数组格式
          if (Array.isArray(delta?.content)) {
            for (const part of delta.content) {
              if (part.type === "text" && part.text) {
                fullContent += part.text;
                callbacks.onToken(part.text);
              } else if (part.type === "image_url" && part.image_url?.url) {
                callbacks.onImage?.({
                  url: part.image_url.url,
                  alt: part.image_url.alt,
                });
              }
            }
          }

          // 直接 image_url 字段（部分 API 使用此格式）
          if (delta?.image_url?.url) {
            callbacks.onImage?.({
              url: delta.image_url.url,
              alt: delta.image_url.alt,
            });
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
