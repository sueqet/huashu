export interface ImageGenerationResult {
  /** base64 编码的图片数据（优先） */
  b64_json?: string;
  /** 图片 URL（备选） */
  url?: string;
  /** 修改后的 prompt */
  revised_prompt?: string;
}

/**
 * 调用 DALL-E 兼容的图片生成 API
 */
export async function generateImage(
  apiUrl: string,
  apiKey: string,
  model: string,
  prompt: string,
  size: string,
  signal?: AbortSignal
): Promise<ImageGenerationResult> {
  // 使用独立端点或默认 API 地址
  const baseUrl = apiUrl.endsWith("/") ? apiUrl.slice(0, -1) : apiUrl;
  const url = `${baseUrl}/images/generations`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      prompt,
      n: 1,
      size,
      response_format: "b64_json",
    }),
    signal,
  });

  if (!response.ok) {
    let errorMsg = `图片生成 API 错误: ${response.status}`;
    try {
      const errorBody = await response.json();
      errorMsg = errorBody.error?.message || errorBody.message || errorMsg;
    } catch {
      // ignore
    }
    throw new Error(errorMsg);
  }

  const data = await response.json();
  const image = data.data?.[0];
  if (!image) {
    throw new Error("图片生成 API 未返回图片数据");
  }

  return {
    b64_json: image.b64_json,
    url: image.url,
    revised_prompt: image.revised_prompt,
  };
}
