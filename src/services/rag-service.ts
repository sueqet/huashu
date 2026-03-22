/**
 * RAG 管线服务：文档处理 → 切分 → Embedding → 索引 → 检索
 */
import { v4 as uuidv4 } from "uuid";
import { readFile, writeFile, BaseDirectory } from "@tauri-apps/plugin-fs";
import type {
  KnowledgeBase,
  KBDocument,
  DocumentChunk,
  EmbeddingConfig,
} from "@/types";
import { fileService } from "./file-service";
import { parseDocument } from "./document-parser";
import { splitText } from "./text-splitter";
import { getEmbedding, getEmbeddings } from "./embedding-service";
import { VectorStore } from "./vector-store";

const BASE_DIR = BaseDirectory.AppData;

function kbDir(projectId: string): string {
  return `projects/${projectId}/knowledge_base`;
}

function kbMetaPath(projectId: string): string {
  return `${kbDir(projectId)}/meta.json`;
}

function chunksPath(projectId: string): string {
  return `${kbDir(projectId)}/chunks.json`;
}

function vectorsPath(projectId: string): string {
  return `${kbDir(projectId)}/vectors.bin`;
}

function docFilePath(projectId: string, filename: string): string {
  return `${kbDir(projectId)}/documents/${filename}`;
}

/** 内存中的向量存储缓存（按项目ID） */
const vectorStoreCache = new Map<string, VectorStore>();

/** 内存中的 chunks 缓存 */
const chunksCache = new Map<string, DocumentChunk[]>();

/**
 * 获取或创建知识库元数据
 */
export async function getKnowledgeBase(
  projectId: string
): Promise<KnowledgeBase | null> {
  try {
    return await fileService.readJSON<KnowledgeBase>(kbMetaPath(projectId));
  } catch {
    return null;
  }
}

/**
 * 初始化知识库
 */
export async function initKnowledgeBase(
  projectId: string,
  embeddingConfig: EmbeddingConfig
): Promise<KnowledgeBase> {
  const now = Date.now();
  const kb: KnowledgeBase = {
    schemaVersion: 1,
    id: uuidv4(),
    projectId,
    name: "知识库",
    documents: [],
    embeddingModel: embeddingConfig.model,
    embeddingDimension: embeddingConfig.dimension,
    createdAt: now,
    updatedAt: now,
  };

  await fileService.ensureDir(kbDir(projectId));
  await fileService.ensureDir(`${kbDir(projectId)}/documents`);
  await fileService.writeJSON(kbMetaPath(projectId), kb);
  await fileService.writeJSON(chunksPath(projectId), []);

  return kb;
}

/**
 * 上传并处理文档
 */
export async function addDocument(
  projectId: string,
  filename: string,
  fileContent: Uint8Array,
  apiUrl: string,
  apiKey: string,
  embeddingModel: string,
  onProgress?: (stage: string, done: number, total: number) => void
): Promise<KBDocument> {
  const kb = await getKnowledgeBase(projectId);
  if (!kb) throw new Error("知识库未初始化");

  const docId = uuidv4();
  const now = Date.now();

  // 创建文档记录
  const doc: KBDocument = {
    id: docId,
    filename,
    fileType: filename.split(".").pop()?.toLowerCase() || "txt",
    fileSize: fileContent.byteLength,
    chunkCount: 0,
    status: "processing",
    createdAt: now,
  };

  // 保存原始文档
  await writeFile(docFilePath(projectId, `${docId}_${filename}`), fileContent, {
    baseDir: BASE_DIR,
  });

  // 更新元数据
  kb.documents.push(doc);
  kb.updatedAt = now;
  await fileService.writeJSON(kbMetaPath(projectId), kb);

  try {
    // 1. 解析文档
    onProgress?.("解析文档", 0, 3);
    const text = await parseDocument(fileContent, filename);

    if (!text.trim()) {
      throw new Error("文档内容为空");
    }

    // 2. 切分文本
    onProgress?.("切分文本", 1, 3);
    const textChunks = await splitText(text);

    // 3. 生成 Embedding
    onProgress?.("生成向量", 2, 3);
    const chunkTexts = textChunks.map((c) => c.content);
    const embeddings = await getEmbeddings(
      chunkTexts,
      apiUrl,
      apiKey,
      embeddingModel,
      (done, total) => onProgress?.(`生成向量 (${done}/${total})`, 2, 3)
    );

    // 创建 chunk 记录
    const chunks: DocumentChunk[] = textChunks.map((tc, i) => ({
      id: `${docId}_chunk_${i}`,
      documentId: docId,
      content: tc.content,
      chunkIndex: tc.chunkIndex,
      metadata: tc.metadata,
    }));

    // 加载现有 chunks
    let allChunks: DocumentChunk[] = [];
    try {
      allChunks = await fileService.readJSON<DocumentChunk[]>(
        chunksPath(projectId)
      );
    } catch {
      // 空的
    }
    allChunks.push(...chunks);
    await fileService.writeJSON(chunksPath(projectId), allChunks);
    chunksCache.set(projectId, allChunks);

    // 更新向量存储
    let store = vectorStoreCache.get(projectId);
    if (!store) {
      store = await loadVectorStore(projectId);
    }
    for (let i = 0; i < chunks.length; i++) {
      store.add(chunks[i].id, embeddings[i].embedding);
    }
    await saveVectorStore(projectId, store);
    vectorStoreCache.set(projectId, store);

    // 更新文档状态
    doc.chunkCount = chunks.length;
    doc.status = "ready";
    doc.updatedAt = Date.now();

    const docIndex = kb.documents.findIndex((d) => d.id === docId);
    if (docIndex !== -1) kb.documents[docIndex] = doc;
    kb.updatedAt = Date.now();
    await fileService.writeJSON(kbMetaPath(projectId), kb);

    onProgress?.("完成", 3, 3);
    return doc;
  } catch (err) {
    // 标记失败
    doc.status = "error";
    doc.errorMessage = err instanceof Error ? err.message : "处理失败";
    doc.updatedAt = Date.now();

    const docIndex = kb.documents.findIndex((d) => d.id === docId);
    if (docIndex !== -1) kb.documents[docIndex] = doc;
    kb.updatedAt = Date.now();
    await fileService.writeJSON(kbMetaPath(projectId), kb);

    throw err;
  }
}

/**
 * 删除文档及其 chunks 和向量
 */
export async function removeDocument(
  projectId: string,
  docId: string
): Promise<void> {
  const kb = await getKnowledgeBase(projectId);
  if (!kb) return;

  // 从元数据中移除
  kb.documents = kb.documents.filter((d) => d.id !== docId);
  kb.updatedAt = Date.now();
  await fileService.writeJSON(kbMetaPath(projectId), kb);

  // 移除 chunks
  let allChunks: DocumentChunk[] = [];
  try {
    allChunks = await fileService.readJSON<DocumentChunk[]>(
      chunksPath(projectId)
    );
  } catch {
    // 空的
  }
  allChunks = allChunks.filter((c) => c.documentId !== docId);
  await fileService.writeJSON(chunksPath(projectId), allChunks);
  chunksCache.set(projectId, allChunks);

  // 移除向量
  let store = vectorStoreCache.get(projectId);
  if (!store) {
    store = await loadVectorStore(projectId);
  }
  store.removeByPrefix(`${docId}_chunk_`);
  await saveVectorStore(projectId, store);
  vectorStoreCache.set(projectId, store);

  // 尝试删除原始文件
  const entries = await fileService.listDir(
    `${kbDir(projectId)}/documents`
  );
  for (const entry of entries) {
    if (entry.name?.startsWith(`${docId}_`)) {
      await fileService.removeFile(
        docFilePath(projectId, entry.name)
      );
    }
  }
}

/**
 * RAG 检索：查询相似片段
 */
export async function searchKnowledge(
  projectId: string,
  query: string,
  apiUrl: string,
  apiKey: string,
  embeddingModel: string,
  topK: number = 5
): Promise<Array<{ chunk: DocumentChunk; score: number }>> {
  // 获取查询向量
  const queryResult = await getEmbedding(query, apiUrl, apiKey, embeddingModel);

  // 加载向量存储
  let store = vectorStoreCache.get(projectId);
  if (!store) {
    store = await loadVectorStore(projectId);
    vectorStoreCache.set(projectId, store);
  }

  if (store.size === 0) return [];

  // 搜索
  const results = store.search(queryResult.embedding, topK);

  // 加载 chunks
  let chunks: DocumentChunk[] | undefined = chunksCache.get(projectId);
  if (!chunks) {
    try {
      chunks = await fileService.readJSON<DocumentChunk[]>(
        chunksPath(projectId)
      );
      chunksCache.set(projectId, chunks);
    } catch {
      return [];
    }
  }

  // 匹配 chunk 详情
  const chunkMap = new Map(chunks.map((c) => [c.id, c]));
  return results
    .map((r) => {
      const chunk = chunkMap.get(r.id);
      if (!chunk) return null;
      return { chunk, score: r.score };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
}

/**
 * 检查 Embedding 模型兼容性
 */
export async function checkEmbeddingCompatibility(
  projectId: string,
  newModel: string,
  newDimension: number
): Promise<{ compatible: boolean; currentModel: string; currentDimension: number }> {
  const kb = await getKnowledgeBase(projectId);
  if (!kb) {
    return { compatible: true, currentModel: "", currentDimension: 0 };
  }

  return {
    compatible:
      kb.embeddingModel === newModel &&
      kb.embeddingDimension === newDimension,
    currentModel: kb.embeddingModel,
    currentDimension: kb.embeddingDimension,
  };
}

/* ========== 内部工具 ========== */

async function loadVectorStore(projectId: string): Promise<VectorStore> {
  try {
    const bytes = await readFile(vectorsPath(projectId), {
      baseDir: BASE_DIR,
    });
    return VectorStore.deserialize(bytes);
  } catch {
    return new VectorStore();
  }
}

async function saveVectorStore(
  projectId: string,
  store: VectorStore
): Promise<void> {
  const bytes = store.serialize();
  await writeFile(vectorsPath(projectId), bytes, { baseDir: BASE_DIR });
}
