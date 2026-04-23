import { v4 as uuidv4 } from "uuid";
import type { Conversation, ChatNode, Attachment } from "@/types";
import { fileService } from "./file-service";
import { attachmentService } from "./attachment-service";

const CURRENT_SCHEMA_VERSION = 1;

function conversationsDir(projectId: string): string {
  return `projects/${projectId}/conversations`;
}

function conversationPath(projectId: string, convId: string): string {
  return `${conversationsDir(projectId)}/${convId}.json`;
}

/**
 * 对话服务：管理对话的完整生命周期
 */
export const conversationService = {
  /**
   * 获取项目内所有对话的概要列表（扫描目录）
   */
  async listConversations(
    projectId: string
  ): Promise<Array<{ id: string; name: string; updatedAt: number }>> {
    const dir = conversationsDir(projectId);
    const entries = await fileService.listDir(dir);
    const list: Array<{ id: string; name: string; updatedAt: number }> = [];

    for (const entry of entries) {
      if (entry.isFile && entry.name?.endsWith(".json")) {
        const convId = entry.name.replace(".json", "");
        try {
          const conv = await fileService.readJSON<Conversation>(
            conversationPath(projectId, convId)
          );
          list.push({
            id: conv.id,
            name: conv.name,
            updatedAt: conv.updatedAt,
          });
        } catch {
          console.warn(`无法读取对话: ${entry.name}`);
        }
      }
    }

    // 按更新时间倒序
    list.sort((a, b) => b.updatedAt - a.updatedAt);
    return list;
  },

  /**
   * 获取完整对话数据
   */
  async getConversation(
    projectId: string,
    convId: string
  ): Promise<Conversation> {
    return fileService.readJSON<Conversation>(
      conversationPath(projectId, convId)
    );
  },

  /**
   * 创建新对话
   */
  async createConversation(
    projectId: string,
    name: string
  ): Promise<Conversation> {
    const id = uuidv4();
    const now = Date.now();

    const conversation: Conversation = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      id,
      projectId,
      name,
      rootNodeIds: [],
      nodes: {},
      createdAt: now,
      updatedAt: now,
    };

    await fileService.ensureDir(conversationsDir(projectId));
    await fileService.writeJSON(
      conversationPath(projectId, id),
      conversation
    );

    return conversation;
  },

  /**
   * 保存对话（完整覆盖写入，剥离附件 data）
   */
  async saveConversation(conversation: Conversation): Promise<void> {
    const updated = { ...conversation, updatedAt: Date.now() };

    // 剥离所有附件的 data 字段，仅保留 filePath
    for (const node of Object.values(updated.nodes)) {
      if (node.attachments) {
        node.attachments = node.attachments.map((att) =>
          attachmentService.stripAttachmentData(att)
        );
      }
    }

    await fileService.writeJSON(
      conversationPath(updated.projectId, updated.id),
      updated
    );
  },

  /**
   * 删除对话（包括附件文件）
   */
  async deleteConversation(
    projectId: string,
    convId: string
  ): Promise<void> {
    await fileService.removeFile(conversationPath(projectId, convId));
    // 清理附件目录
    await attachmentService.deleteConversationAttachments(projectId, convId);
  },

  /**
   * 重命名对话
   */
  async renameConversation(
    projectId: string,
    convId: string,
    newName: string
  ): Promise<Conversation> {
    const conv = await this.getConversation(projectId, convId);
    conv.name = newName;
    conv.updatedAt = Date.now();
    await fileService.writeJSON(
      conversationPath(projectId, convId),
      conv
    );
    return conv;
  },

  /**
   * 创建一个新的聊天节点
   */
  createNode(
    conversationId: string,
    role: ChatNode["role"],
    content: string,
    parentId: string | null,
    attachments?: Attachment[]
  ): ChatNode {
    const now = Date.now();
    const node: ChatNode = {
      id: uuidv4(),
      conversationId,
      parentId,
      childrenIds: [],
      role,
      content,
      isUserEdited: role === "user",
      isPartial: false,
      isPinned: false,
      isStarred: false,
      createdAt: now,
      updatedAt: now,
    };
    if (attachments && attachments.length > 0) {
      node.attachments = attachments;
    }
    return node;
  },
};
