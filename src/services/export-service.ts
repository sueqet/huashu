import JSZip from "jszip";
import { v4 as uuidv4 } from "uuid";
import { fileService } from "./file-service";
import type { Project } from "@/types";
import type { Conversation } from "@/types";

function projectDir(projectId: string): string {
  return `projects/${projectId}`;
}

/**
 * 导入导出服务：支持项目和对话的ZIP打包导入导出
 */
export const exportService = {
  /**
   * 导出项目为ZIP包
   * 包含：meta.json、所有对话
   */
  async exportProject(projectId: string): Promise<Uint8Array> {
    const zip = new JSZip();
    const basePath = projectDir(projectId);

    // 1. 读取并打包 meta.json
    const meta = await fileService.readJSON<Project>(`${basePath}/meta.json`);
    zip.file("meta.json", JSON.stringify(meta, null, 2));

    // 2. 打包所有对话文件
    const convDir = `${basePath}/conversations`;
    const convEntries = await fileService.listDir(convDir);
    for (const entry of convEntries) {
      if (entry.isFile && entry.name?.endsWith(".json")) {
        const content = await fileService.readText(
          `${convDir}/${entry.name}`
        );
        zip.file(`conversations/${entry.name}`, content);
      }
    }

    // 生成ZIP
    const zipData = await zip.generateAsync({ type: "uint8array" });
    return zipData;
  },

  /**
   * 导入项目ZIP包
   * 生成新的项目ID避免冲突，更新所有引用
   * 返回新项目ID
   */
  async importProject(zipData: Uint8Array): Promise<string> {
    const zip = await JSZip.loadAsync(zipData);

    // 1. 读取并解析 meta.json
    const metaFile = zip.file("meta.json");
    if (!metaFile) {
      throw new Error("无效的项目导出文件：缺少 meta.json");
    }
    const metaContent = await metaFile.async("string");
    const meta = JSON.parse(metaContent) as Project;

    // 2. 生成新的项目ID
    const newProjectId = uuidv4();
    const newBasePath = projectDir(newProjectId);

    // 3. 创建项目目录结构
    await fileService.ensureDir(newBasePath);
    await fileService.ensureDir(`${newBasePath}/conversations`);

    // 4. 更新并写入 meta.json
    const now = Date.now();
    const updatedMeta: Project = {
      ...meta,
      id: newProjectId,
      updatedAt: now,
    };
    await fileService.writeJSON(`${newBasePath}/meta.json`, updatedMeta);

    // 5. 导入对话文件，更新项目ID引用
    const convFiles = Object.keys(zip.files).filter(
      (name) =>
        name.startsWith("conversations/") &&
        name.endsWith(".json") &&
        !zip.files[name].dir
    );
    for (const convFileName of convFiles) {
      const convFile = zip.file(convFileName);
      if (!convFile) continue;

      const convContent = await convFile.async("string");
      const conv = JSON.parse(convContent) as Conversation;

      // 生成新的对话ID
      const newConvId = uuidv4();
      const updatedConv: Conversation = {
        ...conv,
        id: newConvId,
        projectId: newProjectId,
      };

      // 更新所有节点的 conversationId
      for (const nodeId of Object.keys(updatedConv.nodes)) {
        updatedConv.nodes[nodeId] = {
          ...updatedConv.nodes[nodeId],
          conversationId: newConvId,
        };
      }

      await fileService.writeJSON(
        `${newBasePath}/conversations/${newConvId}.json`,
        updatedConv
      );
    }

    return newProjectId;
  },

  /**
   * 导出单个对话为ZIP包
   */
  async exportConversation(
    projectId: string,
    convId: string
  ): Promise<Uint8Array> {
    const zip = new JSZip();
    const convPath = `${projectDir(projectId)}/conversations/${convId}.json`;

    const conv = await fileService.readJSON<Conversation>(convPath);
    zip.file(`${convId}.json`, JSON.stringify(conv, null, 2));

    const zipData = await zip.generateAsync({ type: "uint8array" });
    return zipData;
  },

  /**
   * 导入对话ZIP包到指定项目
   * 生成新的对话ID和节点ID映射，返回新对话ID
   */
  async importConversation(
    projectId: string,
    zipData: Uint8Array
  ): Promise<string> {
    const zip = await JSZip.loadAsync(zipData);

    // 找到ZIP中的JSON文件
    const jsonFiles = Object.keys(zip.files).filter(
      (name) => name.endsWith(".json") && !zip.files[name].dir
    );
    if (jsonFiles.length === 0) {
      throw new Error("无效的对话导出文件：未找到对话JSON");
    }

    const convFile = zip.file(jsonFiles[0]);
    if (!convFile) {
      throw new Error("无效的对话导出文件：无法读取对话数据");
    }

    const convContent = await convFile.async("string");
    const conv = JSON.parse(convContent) as Conversation;

    // 生成新的对话ID
    const newConvId = uuidv4();

    // 构建节点ID映射（旧ID -> 新ID）
    const nodeIdMap = new Map<string, string>();
    for (const oldNodeId of Object.keys(conv.nodes)) {
      nodeIdMap.set(oldNodeId, uuidv4());
    }

    // 重建节点字典
    const newNodes: Record<string, typeof conv.nodes[string]> = {};
    for (const [oldId, node] of Object.entries(conv.nodes)) {
      const newId = nodeIdMap.get(oldId)!;
      newNodes[newId] = {
        ...node,
        id: newId,
        conversationId: newConvId,
        parentId: node.parentId ? (nodeIdMap.get(node.parentId) ?? null) : null,
        childrenIds: node.childrenIds
          .map((cid) => nodeIdMap.get(cid))
          .filter((id): id is string => id !== undefined),
      };
    }

    // 更新根节点ID列表
    const newRootNodeIds = conv.rootNodeIds
      .map((rid) => nodeIdMap.get(rid))
      .filter((id): id is string => id !== undefined);

    const updatedConv: Conversation = {
      ...conv,
      id: newConvId,
      projectId,
      rootNodeIds: newRootNodeIds,
      nodes: newNodes,
      updatedAt: Date.now(),
    };

    // 写入文件
    const convDir = `${projectDir(projectId)}/conversations`;
    await fileService.ensureDir(convDir);
    await fileService.writeJSON(`${convDir}/${newConvId}.json`, updatedConv);

    return newConvId;
  },
};
