/** RAG 检索来源引用 */
export interface RagSource {
  /** 文档片段 ID */
  chunkId: string;
  /** 所属文档 ID */
  documentId: string;
  /** 文档名称 */
  documentName: string;
  /** 片段内容摘要 */
  content: string;
  /** 相似度分数 */
  score: number;
}

/** 附件类型 */
export type AttachmentType = "image" | "document";

/** 消息附件 */
export interface Attachment {
  id: string;
  type: AttachmentType;
  filename: string;
  mimeType: string;
  /** base64 data URL (图片) 或解析后的文本 (文档) */
  data: string;
  /** 原始文件大小（字节） */
  size: number;
}

/** 对话节点角色 */
export type NodeRole = "user" | "assistant";

/** 对话节点 - 树的基本单元 */
export interface ChatNode {
  /** 节点唯一标识符，UUID 格式 */
  id: string;
  /** 所属对话 ID，跨树移动时更新 */
  conversationId: string;
  /** 父节点 ID，根节点为 null */
  parentId: string | null;
  /** 子节点 ID 列表，支持多分支 */
  childrenIds: string[];
  /** 角色类型 */
  role: NodeRole;
  /** 消息内容（文本） */
  content: string;
  /** 是否为用户手动编辑（区分颜色） */
  isUserEdited: boolean;
  /** 是否为 AI 中断生成的不完整内容 */
  isPartial: boolean;
  /** 是否锁定（锁定的节点在滑动窗口中不被移除） */
  isPinned: boolean;
  /** 是否收藏标记 */
  isStarred: boolean;
  /** 使用的模型名称（AI 节点） */
  modelName?: string;
  /** 附件列表（图片、文档） */
  attachments?: Attachment[];
  /** RAG 检索来源（引用的知识库片段） */
  ragSources?: RagSource[];
  /** 创建时间 */
  createdAt: number;
  /** 最后更新时间 */
  updatedAt: number;
}
