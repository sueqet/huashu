/**
 * 纯 JS 向量存储与检索
 * 使用暴力搜索 + 余弦相似度，适合中小规模知识库（<10000 片段）
 * 未来可替换为 HNSW 实现以提升大规模检索性能
 */

export interface VectorEntry {
  id: string;
  embedding: number[];
}

export interface SearchResult {
  id: string;
  score: number;
}

/**
 * 余弦相似度
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dotProduct / denom;
}

/**
 * 内存向量存储
 */
export class VectorStore {
  private entries: VectorEntry[] = [];
  private dimension: number = 0;

  constructor(dimension?: number) {
    if (dimension) this.dimension = dimension;
  }

  /** 添加向量 */
  add(id: string, embedding: number[]): void {
    if (this.dimension === 0) {
      this.dimension = embedding.length;
    }
    if (embedding.length !== this.dimension) {
      throw new Error(
        `向量维度不匹配: 期望 ${this.dimension}, 实际 ${embedding.length}`
      );
    }
    // 去重
    this.entries = this.entries.filter((e) => e.id !== id);
    this.entries.push({ id, embedding });
  }

  /** 批量添加 */
  addBatch(items: Array<{ id: string; embedding: number[] }>): void {
    for (const item of items) {
      this.add(item.id, item.embedding);
    }
  }

  /** 删除向量 */
  remove(id: string): void {
    this.entries = this.entries.filter((e) => e.id !== id);
  }

  /** 按文档 ID 前缀批量删除 */
  removeByPrefix(prefix: string): void {
    this.entries = this.entries.filter((e) => !e.id.startsWith(prefix));
  }

  /** Top-K 余弦相似度检索 */
  search(query: number[], topK: number = 5): SearchResult[] {
    if (this.entries.length === 0) return [];

    const scored = this.entries.map((entry) => ({
      id: entry.id,
      score: cosineSimilarity(query, entry.embedding),
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }

  /** 序列化为二进制（用于持久化） */
  serialize(): Uint8Array {
    const data = {
      dimension: this.dimension,
      entries: this.entries.map((e) => ({
        id: e.id,
        embedding: Array.from(e.embedding),
      })),
    };
    const json = JSON.stringify(data);
    return new TextEncoder().encode(json);
  }

  /** 从二进制反序列化 */
  static deserialize(bytes: Uint8Array): VectorStore {
    const json = new TextDecoder().decode(bytes);
    const data = JSON.parse(json) as {
      dimension: number;
      entries: Array<{ id: string; embedding: number[] }>;
    };
    const store = new VectorStore(data.dimension);
    store.entries = data.entries;
    return store;
  }

  /** 条目数量 */
  get size(): number {
    return this.entries.length;
  }

  /** 获取维度 */
  getDimension(): number {
    return this.dimension;
  }

  /** 清空 */
  clear(): void {
    this.entries = [];
  }
}
