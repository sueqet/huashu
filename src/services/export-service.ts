import JSZip from "jszip";
import { v4 as uuidv4 } from "uuid";
import { readFile, writeFile, BaseDirectory } from "@tauri-apps/plugin-fs";
import { fileService } from "./file-service";
import { projectService } from "./project-service";
import type { Project } from "@/types";
import type { Conversation } from "@/types";

const BASE_DIR = BaseDirectory.AppData;

function projectDir(projectId: string): string {
  return `projects/${projectId}`;
}

/**
 * 导入导出服务：支持项目和对话的ZIP打包导入导出
 */
export const exportService = {
  /**
   * 导出项目为ZIP包
   * 包含：meta.json、所有对话、知识库（元信息+文档+向量索引）
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

    // 3. 打包知识库
    const kbPath = `${basePath}/knowledge_base`;
    const kbExists = await fileService.exists(kbPath);
    if (kbExists) {
      // meta.json
      const kbMetaExists = await fileService.exists(`${kbPath}/meta.json`);
      if (kbMetaExists) {
        const kbMeta = await fileService.readText(`${kbPath}/meta.json`);
        zip.file("knowledge_base/meta.json", kbMeta);
      }

      // chunks.json
      const chunksExists = await fileService.exists(`${kbPath}/chunks.json`);
      if (chunksExists) {
        const chunks = await fileService.readText(`${kbPath}/chunks.json`);
        zip.file("knowledge_base/chunks.json", chunks);
      }

      // vectors.bin (二进制)
      const vectorsExists = await fileService.exists(`${kbPath}/vectors.bin`);
      if (vectorsExists) {
        const vectorsData = await readFile(`${kbPath}/vectors.bin`, {
          baseDir: BASE_DIR,
        });
        zip.file("knowledge_base/vectors.bin", vectorsData);
      }

      // documents/ 目录下的所有文件
      const docsPath = `${kbPath}/documents`;
      const docsExists = await fileService.exists(docsPath);
      if (docsExists) {
        const docEntries = await fileService.listDir(docsPath);
        for (const doc of docEntries) {
          if (doc.isFile && doc.name) {
            try {
              // 读取为二进制（可能是PDF等二进制文件）
              const docData = await readFile(`${docsPath}/${doc.name}`, {
                baseDir: BASE_DIR,
              });
              zip.file(`knowledge_base/documents/${doc.name}`, docData);
            } catch {
              console.warn(`无法读取知识库文档: ${doc.name}`);
            }
          }
        }
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
    await fileService.ensureDir(`${newBasePath}/knowledge_base`);
    await fileService.ensureDir(`${newBasePath}/knowledge_base/documents`);

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

    // 6. 导入知识库文件
    // meta.json
    const kbMetaFile = zip.file("knowledge_base/meta.json");
    if (kbMetaFile) {
      const kbMeta = await kbMetaFile.async("string");
      await fileService.writeText(
        `${newBasePath}/knowledge_base/meta.json`,
        kbMeta
      );
    }

    // chunks.json
    const chunksFile = zip.file("knowledge_base/chunks.json");
    if (chunksFile) {
      const chunks = await chunksFile.async("string");
      await fileService.writeText(
        `${newBasePath}/knowledge_base/chunks.json`,
        chunks
      );
    }

    // vectors.bin (二进制)
    const vectorsFile = zip.file("knowledge_base/vectors.bin");
    if (vectorsFile) {
      const vectorsData = await vectorsFile.async("uint8array");
      await writeFile(`${newBasePath}/knowledge_base/vectors.bin`, vectorsData, {
        baseDir: BASE_DIR,
      });
    }

    // documents/ 下的文件
    const docFiles = Object.keys(zip.files).filter(
      (name) =>
        name.startsWith("knowledge_base/documents/") &&
        !zip.files[name].dir
    );
    for (const docFileName of docFiles) {
      const docFile = zip.file(docFileName);
      if (!docFile) continue;

      const fileName = docFileName.replace("knowledge_base/documents/", "");
      const docData = await docFile.async("uint8array");
      await writeFile(
        `${newBasePath}/knowledge_base/documents/${fileName}`,
        docData,
        { baseDir: BASE_DIR }
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

  /**
   * 导入剧本模板文件
   * 创建故事模式项目并填充模板内容
   * 返回新项目 ID
   */
  async importStoryTemplate(
    templateData: Record<string, unknown>
  ): Promise<string> {
    const { importStoryTemplate: parseTemplate } = await import("./story-service");
    const { config, errors } = parseTemplate(templateData);
    if (errors.length > 0) {
      throw new Error(errors.join("; "));
    }

    // 创建故事模式项目
    const project = await projectService.createProject(
      config.templateMeta?.name || "新故事",
      undefined,
      "story",
      config
    );

    return project.id;
  },
};
