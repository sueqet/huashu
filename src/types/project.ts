import type { StoryConfig, AgentConfig } from "./story";

/** 项目 - 独立工作空间 */
export interface Project {
  /** 数据结构版本号 */
  schemaVersion: number;
  /** 项目唯一标识符 */
  id: string;
  /** 项目名称 */
  name: string;
  /** 项目描述（作为系统提示词前缀） */
  description?: string;
  /** 对话排序列表（仅存排序，非完整列表） */
  conversationOrder?: string[];
  /** 创建时间 */
  createdAt: number;
  /** 最后更新时间 */
  updatedAt: number;
  /** 是否已归档 */
  isArchived: boolean;
  /** 是否启用 RAG 检索 */
  ragEnabled: boolean;
  /** 项目模式 */
  mode: "chat" | "story" | "agent";
  /** 故事配置（仅 mode='story'） */
  storyConfig?: StoryConfig;
  /** Agent 配置（预留，仅 mode='agent'） */
  agentConfig?: AgentConfig;
}
