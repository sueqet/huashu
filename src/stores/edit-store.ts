import { create } from "zustand";
import type { Conversation } from "@/types";

const MAX_SNAPSHOTS = 50;

interface EditState {
  /** 是否处于编辑模式 */
  isEditMode: boolean;
  /** 撤销栈（变更前的对话状态） */
  undoStack: Conversation[];
  /** 重做栈（撤销后的对话状态） */
  redoStack: Conversation[];

  /** 切换编辑模式 */
  toggleEditMode: () => void;
  /** 设置编辑模式 */
  setEditMode: (value: boolean) => void;
  /** 拍摄快照（在变更之前调用，传入变更前的对话） */
  takeSnapshot: (conversation: Conversation) => void;
  /** 撤销，传入当前对话，返回要恢复的对话快照 */
  undo: (currentConversation: Conversation) => Conversation | null;
  /** 重做，传入当前对话，返回要恢复的对话快照 */
  redo: (currentConversation: Conversation) => Conversation | null;
  /** 是否可以撤销 */
  canUndo: () => boolean;
  /** 是否可以重做 */
  canRedo: () => boolean;
  /** 清空快照（切换对话或退出编辑模式时调用） */
  clearSnapshots: () => void;
}

function deepCopy(conv: Conversation): Conversation {
  return JSON.parse(JSON.stringify(conv)) as Conversation;
}

export const useEditStore = create<EditState>()((set, get) => ({
  isEditMode: false,
  undoStack: [],
  redoStack: [],

  toggleEditMode: () => {
    const current = get().isEditMode;
    if (current) {
      set({ isEditMode: false, undoStack: [], redoStack: [] });
    } else {
      set({ isEditMode: true, undoStack: [], redoStack: [] });
    }
  },

  setEditMode: (value) => {
    if (!value) {
      set({ isEditMode: false, undoStack: [], redoStack: [] });
    } else {
      set({ isEditMode: true });
    }
  },

  takeSnapshot: (conversation) => {
    const { undoStack } = get();
    const snapshot = deepCopy(conversation);
    const newStack = [...undoStack, snapshot];

    // 限制快照数量
    if (newStack.length > MAX_SNAPSHOTS) {
      newStack.shift();
    }

    // 新操作会清空重做栈
    set({
      undoStack: newStack,
      redoStack: [],
    });
  },

  undo: (currentConversation) => {
    const { undoStack, redoStack } = get();
    if (undoStack.length === 0) return null;

    const newUndoStack = [...undoStack];
    const snapshot = newUndoStack.pop()!;

    // 将当前状态推入重做栈
    const newRedoStack = [...redoStack, deepCopy(currentConversation)];

    set({
      undoStack: newUndoStack,
      redoStack: newRedoStack,
    });

    return deepCopy(snapshot);
  },

  redo: (currentConversation) => {
    const { undoStack, redoStack } = get();
    if (redoStack.length === 0) return null;

    const newRedoStack = [...redoStack];
    const snapshot = newRedoStack.pop()!;

    // 将当前状态推入撤销栈
    const newUndoStack = [...undoStack, deepCopy(currentConversation)];

    set({
      undoStack: newUndoStack,
      redoStack: newRedoStack,
    });

    return deepCopy(snapshot);
  },

  canUndo: () => {
    return get().undoStack.length > 0;
  },

  canRedo: () => {
    return get().redoStack.length > 0;
  },

  clearSnapshots: () => {
    set({ undoStack: [], redoStack: [] });
  },
}));
