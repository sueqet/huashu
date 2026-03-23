import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { Conversation, ChatNode } from "@/types";
import { conversationService } from "@/services";

interface ConversationState {
  /** 当前加载的对话 */
  conversation: Conversation | null;
  /** 对话列表（当前项目的） */
  conversationList: Array<{ id: string; name: string; updatedAt: number }>;
  /** 是否正在加载 */
  loading: boolean;

  /** 加载项目的对话列表 */
  loadConversationList: (projectId: string) => Promise<void>;
  /** 加载完整对话 */
  loadConversation: (projectId: string, convId: string) => Promise<void>;
  /** 创建新对话 */
  createConversation: (projectId: string, name: string) => Promise<Conversation>;
  /** 删除对话 */
  deleteConversation: (projectId: string, convId: string) => Promise<void>;
  /** 重命名对话 */
  renameConversation: (projectId: string, convId: string, newName: string) => Promise<void>;
  /** 关闭当前对话 */
  closeConversation: () => void;
  /** 添加节点并保存 */
  addNodeAndSave: (node: ChatNode) => Promise<void>;
  /** 更新节点并保存 */
  updateNodeAndSave: (nodeId: string, updates: Partial<ChatNode>) => Promise<void>;
  /** 删除节点子树并保存 */
  removeNodeTreeAndSave: (nodeId: string) => Promise<void>;
  /** 断开节点与父节点的连接，使其成为根节点 */
  detachNodeAndSave: (nodeId: string) => Promise<void>;
  /** 将 sourceId 节点重新连接为 targetId 的子节点 */
  reconnectNodeAndSave: (sourceId: string, targetId: string) => Promise<void>;
  /** 恢复对话状态（用于撤销/重做） */
  restoreConversation: (conv: Conversation) => Promise<void>;
}

export const useConversationStore = create<ConversationState>()(
  immer((set, get) => ({
    conversation: null,
    conversationList: [],
    loading: false,

    loadConversationList: async (projectId) => {
      const list = await conversationService.listConversations(projectId);
      set((state) => {
        state.conversationList = list;
      });
    },

    loadConversation: async (projectId, convId) => {
      set((state) => {
        state.loading = true;
      });
      try {
        const conv = await conversationService.getConversation(projectId, convId);
        set((state) => {
          state.conversation = conv;
        });
      } finally {
        set((state) => {
          state.loading = false;
        });
      }
    },

    createConversation: async (projectId, name) => {
      const conv = await conversationService.createConversation(projectId, name);
      set((state) => {
        state.conversationList.unshift({
          id: conv.id,
          name: conv.name,
          updatedAt: conv.updatedAt,
        });
      });
      return conv;
    },

    deleteConversation: async (projectId, convId) => {
      await conversationService.deleteConversation(projectId, convId);
      set((state) => {
        state.conversationList = state.conversationList.filter(
          (c) => c.id !== convId
        );
        if (state.conversation?.id === convId) {
          state.conversation = null;
        }
      });
    },

    renameConversation: async (projectId, convId, newName) => {
      await conversationService.renameConversation(projectId, convId, newName);
      set((state) => {
        const item = state.conversationList.find((c) => c.id === convId);
        if (item) {
          item.name = newName;
        }
        if (state.conversation?.id === convId) {
          state.conversation.name = newName;
        }
      });
    },

    closeConversation: () => {
      set((state) => {
        state.conversation = null;
      });
    },

    addNodeAndSave: async (node) => {
      set((state) => {
        if (!state.conversation) return;
        state.conversation.nodes[node.id] = node;
        if (node.parentId === null) {
          state.conversation.rootNodeIds.push(node.id);
        } else {
          const parent = state.conversation.nodes[node.parentId];
          if (parent) {
            parent.childrenIds.push(node.id);
          }
        }
        state.conversation.updatedAt = Date.now();
      });
      const conv = get().conversation;
      if (conv) {
        await conversationService.saveConversation(conv);
      }
    },

    updateNodeAndSave: async (nodeId, updates) => {
      set((state) => {
        if (!state.conversation) return;
        const node = state.conversation.nodes[nodeId];
        if (node) {
          Object.assign(node, updates, { updatedAt: Date.now() });
          state.conversation.updatedAt = Date.now();
        }
      });
      const conv = get().conversation;
      if (conv) {
        await conversationService.saveConversation(conv);
      }
    },

    removeNodeTreeAndSave: async (nodeId) => {
      set((state) => {
        if (!state.conversation) return;
        const toRemove: string[] = [];
        const collect = (id: string) => {
          toRemove.push(id);
          const node = state.conversation!.nodes[id];
          if (node) {
            node.childrenIds.forEach(collect);
          }
        };
        collect(nodeId);

        const target = state.conversation.nodes[nodeId];
        if (target?.parentId) {
          const parent = state.conversation.nodes[target.parentId];
          if (parent) {
            parent.childrenIds = parent.childrenIds.filter(
              (id) => id !== nodeId
            );
          }
        }

        state.conversation.rootNodeIds =
          state.conversation.rootNodeIds.filter((id) => id !== nodeId);

        for (const id of toRemove) {
          delete state.conversation.nodes[id];
        }

        state.conversation.updatedAt = Date.now();
      });
      const conv = get().conversation;
      if (conv) {
        await conversationService.saveConversation(conv);
      }
    },
    detachNodeAndSave: async (nodeId) => {
      set((state) => {
        if (!state.conversation) return;
        const node = state.conversation.nodes[nodeId];
        if (!node) return;

        // 从父节点的 childrenIds 中移除
        if (node.parentId) {
          const parent = state.conversation.nodes[node.parentId];
          if (parent) {
            parent.childrenIds = parent.childrenIds.filter((id) => id !== nodeId);
          }
        }

        // 设为根节点
        node.parentId = null;
        if (!state.conversation.rootNodeIds.includes(nodeId)) {
          state.conversation.rootNodeIds.push(nodeId);
        }

        state.conversation.updatedAt = Date.now();
      });
      const conv = get().conversation;
      if (conv) {
        await conversationService.saveConversation(conv);
      }
    },

    reconnectNodeAndSave: async (sourceId, targetId) => {
      set((state) => {
        if (!state.conversation) return;
        const sourceNode = state.conversation.nodes[sourceId];
        const targetNode = state.conversation.nodes[targetId];
        if (!sourceNode || !targetNode) return;

        // 先从旧父节点断开
        if (sourceNode.parentId) {
          const oldParent = state.conversation.nodes[sourceNode.parentId];
          if (oldParent) {
            oldParent.childrenIds = oldParent.childrenIds.filter((id) => id !== sourceId);
          }
        }

        // 从 rootNodeIds 中移除（如果之前是根节点）
        state.conversation.rootNodeIds = state.conversation.rootNodeIds.filter(
          (id) => id !== sourceId
        );

        // 连接到新父节点
        sourceNode.parentId = targetId;
        if (!targetNode.childrenIds.includes(sourceId)) {
          targetNode.childrenIds.push(sourceId);
        }

        state.conversation.updatedAt = Date.now();
      });
      const conv = get().conversation;
      if (conv) {
        await conversationService.saveConversation(conv);
      }
    },

    restoreConversation: async (conv) => {
      set((state) => {
        state.conversation = conv;
      });
      await conversationService.saveConversation(conv);
    },
  }))
);
