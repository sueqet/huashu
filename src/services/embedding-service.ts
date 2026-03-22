/**
 * Embedding 服务：调用 API 获取文本向量
 */

export interface EmbeddingResult {
  embedding: number[];
  tokenCount: number;
}

/**
 * 调用 OpenAI 兼容的 Embedding API
 */
export async function getEmbedding(
  text: string,
  apiUrl: string,
  apiKey: string,
  model: string
): Promise<EmbeddingResult> {
  const url = apiUrl.endsWith("/")
    ? `${apiUrl}embeddings`
    : `${apiUrl}/embeddings`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: text,
    }),
  });

  if (!response.ok) {
    let errorMsg = `Embedding API 错误: ${response.status}`;
    try {
      const errorBody = await response.json();
      errorMsg = errorBody.error?.message || errorMsg;
    } catch {
      // ignore
    }
    throw new Error(errorMsg);
  }

  const data = await response.json();
  const embeddingData = data.data?.[0];

  if (!embeddingData?.embedding) {
    throw new Error("Embedding API 返回数据格式异常");
  }

  return {
    embedding: embeddingData.embedding,
    tokenCount: data.usage?.total_tokens || 0,
  };
}

/**
 * 批量获取 Embedding
 */
export async function getEmbeddings(
  texts: string[],
  apiUrl: string,
  apiKey: string,
  model: string,
  onProgress?: (done: number, total: number) => void
): Promise<EmbeddingResult[]> {
  const results: EmbeddingResult[] = [];

  // 逐条调用（避免批量请求过大）
  for (let i = 0; i < texts.length; i++) {
    const result = await getEmbedding(texts[i], apiUrl, apiKey, model);
    results.push(result);
    onProgress?.(i + 1, texts.length);
  }

  return results;
}
