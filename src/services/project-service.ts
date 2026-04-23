import { v4 as uuidv4 } from "uuid";
import type { Project, StoryConfig } from "@/types";
import { fileService } from "./file-service";

const CURRENT_SCHEMA_VERSION = 1;

function projectDir(projectId: string): string {
  return `projects/${projectId}`;
}

function metaPath(projectId: string): string {
  return `${projectDir(projectId)}/meta.json`;
}

/** 为旧项目补全 mode 字段 */
function migrateProject(project: Project): Project {
  if (!project.mode) {
    project.mode = "chat";
  }
  return project;
}

/**
 * 项目服务：管理项目的完整生命周期
 */
export const projectService = {
  /**
   * 获取所有项目列表（扫描 projects 目录）
   */
  async listProjects(): Promise<Project[]> {
    const entries = await fileService.listDir("projects");
    const projects: Project[] = [];

    for (const entry of entries) {
      if (entry.isDirectory && entry.name) {
        try {
          let project = await fileService.readJSON<Project>(
            metaPath(entry.name)
          );
          project = migrateProject(project);
          projects.push(project);
        } catch {
          // 跳过无法读取的项目目录
          console.warn(`无法读取项目: ${entry.name}`);
        }
      }
    }

    // 按更新时间倒序
    projects.sort((a, b) => b.updatedAt - a.updatedAt);
    return projects;
  },

  /**
   * 获取单个项目
   */
  async getProject(projectId: string): Promise<Project> {
    const project = await fileService.readJSON<Project>(metaPath(projectId));
    return migrateProject(project);
  },

  /**
   * 创建新项目
   */
  async createProject(
    name: string,
    description?: string,
    mode: "chat" | "story" | "agent" = "chat",
    storyConfig?: StoryConfig
  ): Promise<Project> {
    const id = uuidv4();
    const now = Date.now();

    const project: Project = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      id,
      name,
      description,
      conversationOrder: [],
      createdAt: now,
      updatedAt: now,
      isArchived: false,
      ragEnabled: mode === "story", // 故事模式自动启用 RAG
      mode,
      storyConfig,
    };

    // 创建项目目录结构
    await fileService.ensureDir(projectDir(id));
    await fileService.ensureDir(`${projectDir(id)}/conversations`);
    await fileService.ensureDir(`${projectDir(id)}/attachments`);
    await fileService.ensureDir(`${projectDir(id)}/knowledge_base`);
    await fileService.ensureDir(`${projectDir(id)}/knowledge_base/documents`);

    // 写入项目元数据
    await fileService.writeJSON(metaPath(id), project);

    return project;
  },

  /**
   * 更新项目
   */
  async updateProject(
    projectId: string,
    updates: Partial<Pick<Project, "name" | "description" | "conversationOrder" | "isArchived" | "ragEnabled" | "storyConfig">>
  ): Promise<Project> {
    const project = await this.getProject(projectId);
    const updated: Project = {
      ...project,
      ...updates,
      updatedAt: Date.now(),
    };
    await fileService.writeJSON(metaPath(projectId), updated);
    return updated;
  },

  /**
   * 删除项目（包括所有对话和知识库）
   */
  async deleteProject(projectId: string): Promise<void> {
    await fileService.removeDir(projectDir(projectId));
  },

  /**
   * 归档/取消归档项目
   */
  async toggleArchive(projectId: string): Promise<Project> {
    const project = await this.getProject(projectId);
    return this.updateProject(projectId, {
      isArchived: !project.isArchived,
    });
  },
};
