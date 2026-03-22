import type { ChatNode } from "./node";

/** 对话 - 一棵完整的节点树 */
export interface Conversation {
  /** 数据结构版本号 */
  schemaVersion: number;
  /** 对话唯一标识符 */
  id: string;
  /** 所属项目 ID */
  projectId: string;
  /** 对话名称 */
  name: string;
  /** 根节点 ID 列表（支持多根节点） */
  rootNodeIds: string[];
  /** 节点字典：{nodeId: Node} */
  nodes: Record<string, ChatNode>;
  /** 创建时间 */
  createdAt: number;
  /** 最后更新时间 */
  updatedAt: number;
}
