import { v4 as uuidv4 } from "uuid";
import type { Attachment, ChatNode, Conversation } from "@/types";
import { attachmentService } from "./attachment-service";
import { fileService } from "./file-service";

const CURRENT_SCHEMA_VERSION = 1;

function conversationsDir(projectId: string): string {
  return `projects/${projectId}/conversations`;
}

function conversationPath(projectId: string, convId: string): string {
  return `${conversationsDir(projectId)}/${convId}.json`;
}

function serializeNode(node: ChatNode): ChatNode {
  return {
    ...node,
    attachments: node.attachments?.map((attachment) =>
      attachmentService.stripAttachmentData(attachment)
    ),
  };
}

export const conversationService = {
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
          console.warn(`Unable to read conversation: ${entry.name}`);
        }
      }
    }

    list.sort((a, b) => b.updatedAt - a.updatedAt);
    return list;
  },

  async getConversation(projectId: string, convId: string): Promise<Conversation> {
    return fileService.readJSON<Conversation>(conversationPath(projectId, convId));
  },

  async createConversation(projectId: string, name: string): Promise<Conversation> {
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
    await fileService.writeJSON(conversationPath(projectId, id), conversation);

    return conversation;
  },

  async saveConversation(conversation: Conversation): Promise<void> {
    const updated: Conversation = {
      ...conversation,
      updatedAt: Date.now(),
      nodes: Object.fromEntries(
        Object.entries(conversation.nodes).map(([nodeId, node]) => [
          nodeId,
          serializeNode(node),
        ])
      ),
    };

    await fileService.writeJSON(
      conversationPath(updated.projectId, updated.id),
      updated
    );
  },

  async deleteConversation(projectId: string, convId: string): Promise<void> {
    await fileService.removeFile(conversationPath(projectId, convId));
    await attachmentService.deleteConversationAttachments(projectId, convId);
  },

  async renameConversation(
    projectId: string,
    convId: string,
    newName: string
  ): Promise<Conversation> {
    const conv = await this.getConversation(projectId, convId);
    conv.name = newName;
    conv.updatedAt = Date.now();
    await fileService.writeJSON(conversationPath(projectId, convId), conv);
    return conv;
  },

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
