import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

interface AppState {
  /** 当前选中的项目 ID */
  currentProjectId: string | null;
  /** 当前选中的对话 ID */
  currentConversationId: string | null;
  /** 当前视图 */
  currentView: "projects" | "conversations" | "settings" | "canvas";

  /** 设置当前项目 */
  setCurrentProject: (projectId: string | null) => void;
  /** 设置当前对话 */
  setCurrentConversation: (conversationId: string | null) => void;
  /** 设置当前视图 */
  setCurrentView: (view: AppState["currentView"]) => void;
}

export const useAppStore = create<AppState>()(
  immer((set) => ({
    currentProjectId: null,
    currentConversationId: null,
    currentView: "projects",

    setCurrentProject: (projectId) =>
      set((state) => {
        state.currentProjectId = projectId;
      }),

    setCurrentConversation: (conversationId) =>
      set((state) => {
        state.currentConversationId = conversationId;
      }),

    setCurrentView: (view) =>
      set((state) => {
        state.currentView = view;
      }),
  }))
);
