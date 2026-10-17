import { v4 as uuidv4 } from "uuid";
import type { Project, StoryConfig } from "@/types";
import { emptyCharacterContent } from "@/lib/character-card";
import { characterService } from "./character-service";
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
 * 旧版故事把角色（名字 + 描述）内联在 storyConfig.characters 中，
 * 迁移为角色库中的角色卡并改为引用。返回是否有改动。
 */
async function migrateLegacyCharacters(project: Project): Promise<boolean> {
  const config = project.storyConfig;
  if (!config) return false;
  if (Array.isArray(config.characterIds) && !config.characters) return false;

  const ids = Array.isArray(config.characterIds) ? [...config.characterIds] : [];
  for (const legacy of config.characters ?? []) {
    if (!legacy?.name?.trim()) continue;
    const card = await characterService.create({
      ...emptyCharacterContent(legacy.name.trim()),
      description: legacy.description || "",
    });
    ids.push(card.id);
  }

  const { characters: _legacy, ...rest } = config;
  project.storyConfig = { ...rest, characterIds: ids };
  return true;
}

async function loadProject(projectId: string): Promise<Project> {
  const project = migrateProject(await fileService.readJSON<Project>(metaPath(projectId)));
  if (await migrateLegacyCharacters(project)) {
    await fileService.writeJSON(metaPath(projectId), project);
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
          projects.push(await loadProject(entry.name));
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
    return loadProject(projectId);
  },

  /**
   * 创建新项目
   */
  async createProject(
    name: string,
    description?: string,
    mode: Project["mode"] = "chat",
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
      mode,
      storyConfig,
    };

    // 创建项目目录结构
    await fileService.ensureDir(projectDir(id));
    await fileService.ensureDir(`${projectDir(id)}/conversations`);
    await fileService.ensureDir(`${projectDir(id)}/attachments`);

    // 写入项目元数据
    await fileService.writeJSON(metaPath(id), project);

    return project;
  },

  /**
   * 更新项目
   */
  async updateProject(
    projectId: string,
    updates: Partial<Pick<Project, "name" | "description" | "conversationOrder" | "isArchived" | "storyConfig">>
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
   * 删除项目（包括所有对话和附件）
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
