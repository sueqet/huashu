import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { Project } from "@/types";
import { projectService } from "@/services";

interface ProjectState {
  /** 项目列表 */
  projects: Project[];
  /** 是否正在加载 */
  loading: boolean;

  /** 从文件系统加载所有项目 */
  loadProjects: () => Promise<void>;
  /** 创建新项目 */
  createProject: (name: string, description?: string) => Promise<Project>;
  /** 更新项目 */
  updateProject: (
    id: string,
    updates: Partial<Pick<Project, "name" | "description" | "isArchived" | "ragEnabled">>
  ) => Promise<void>;
  /** 删除项目 */
  deleteProject: (id: string) => Promise<void>;
  /** 归档/取消归档 */
  toggleArchive: (id: string) => Promise<void>;
}

export const useProjectStore = create<ProjectState>()(
  immer((set) => ({
    projects: [],
    loading: false,

    loadProjects: async () => {
      set((state) => {
        state.loading = true;
      });
      try {
        const projects = await projectService.listProjects();
        set((state) => {
          state.projects = projects;
        });
      } finally {
        set((state) => {
          state.loading = false;
        });
      }
    },

    createProject: async (name, description) => {
      const project = await projectService.createProject(name, description);
      set((state) => {
        state.projects.unshift(project);
      });
      return project;
    },

    updateProject: async (id, updates) => {
      const updated = await projectService.updateProject(id, updates);
      set((state) => {
        const index = state.projects.findIndex((p) => p.id === id);
        if (index !== -1) {
          state.projects[index] = updated;
        }
      });
    },

    deleteProject: async (id) => {
      await projectService.deleteProject(id);
      set((state) => {
        state.projects = state.projects.filter((p) => p.id !== id);
      });
    },

    toggleArchive: async (id) => {
      const updated = await projectService.toggleArchive(id);
      set((state) => {
        const index = state.projects.findIndex((p) => p.id === id);
        if (index !== -1) {
          state.projects[index] = updated;
        }
      });
    },
  }))
);
