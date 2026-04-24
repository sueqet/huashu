export interface ImageGenerationResult {
  b64_json?: string;
  url?: string;
  revised_prompt?: string;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}

export async function resolveGeneratedImageDataUrl(
  result: ImageGenerationResult
): Promise<string> {
  if (result.b64_json) {
    return `data:image/png;base64,${result.b64_json}`;
  }

  if (!result.url) {
    throw new Error("图片生成 API 未返回图片数据");
  }

  const response = await fetch(result.url);
  if (!response.ok) {
    throw new Error(`无法下载生成图片: ${response.status}`);
  }

  return blobToDataUrl(await response.blob());
}

export async function generateImage(
  apiUrl: string,
  apiKey: string,
  model: string,
  prompt: string,
  size: string,
  signal?: AbortSignal
): Promise<ImageGenerationResult> {
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
