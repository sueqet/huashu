/** 文档处理状态 */
export type DocumentStatus = "pending" | "processing" | "ready" | "error";

/** 知识库文档 */
export interface KBDocument {
  /** 文档唯一标识符 */
  id: string;
  /** 原始文件名 */
  filename: string;
  /** 文件类型（pdf/txt/md/docx 等） */
  fileType: string;
  /** 文件大小（字节） */
  fileSize: number;
  /** 切分后的片段数量 */
  chunkCount: number;
  /** 处理状态 */
  status: DocumentStatus;
  /** 上传时间 */
  createdAt: number;
  /** 最后更新时间 */
  updatedAt?: number;
  /** 处理错误信息 */
  errorMessage?: string;
}

/** 文档片段 */
export interface DocumentChunk {
  /** 片段唯一标识符 */
  id: string;
  /** 所属文档 ID */
  documentId: string;
  /** 片段文本内容 */
  content: string;
  /** 片段在文档中的序号 */
  chunkIndex: number;
  /** 元数据（页码、位置等） */
  metadata?: Record<string, unknown>;
}

/** 知识库元数据 */
export interface KnowledgeBase {
  /** 数据结构版本号 */
  schemaVersion: number;
  /** 知识库唯一标识符 */
  id: string;
  /** 所属项目 ID */
  projectId: string;
  /** 知识库名称 */
  name: string;
  /** 文档列表 */
  documents: KBDocument[];
  /** 当前使用的 Embedding 模型名称 */
  embeddingModel: string;
  /** 当前 Embedding 模型的向量维度 */
  embeddingDimension: number;
  /** 创建时间 */
  createdAt: number;
  /** 最后更新时间 */
  updatedAt: number;
}
