import { fileService } from "./file-service";
import { attachmentService } from "./attachment-service";
import type { Conversation } from "@/types";

const MIGRATION_FLAG_KEY = "attachment_migration_v2_done";

/**
 * 一次性迁移：将对话 JSON 中内嵌的 base64 data 提取为独立文件
 * 幂等设计：已存在的文件不重复写入
 */
export async function migrateAttachments(): Promise<void> {
  // 检查是否已迁移
  const flagExists = await fileService.exists(`.migration-flags/${MIGRATION_FLAG_KEY}`);
  if (flagExists) return;

  console.log("[attachment-migration] 开始迁移附件数据...");

  try {
    const projects = await fileService.listDir("projects");
    let totalMigrated = 0;

    for (const project of projects) {
      if (!project.isDirectory || !project.name) continue;

      const projectId = project.name;
      const convDir = `projects/${projectId}/conversations`;
      const convEntries = await fileService.listDir(convDir);

      for (const entry of convEntries) {
        if (!entry.isFile || !entry.name?.endsWith(".json")) continue;

        const convId = entry.name.replace(".json", "");
        const convPath = `${convDir}/${entry.name}`;

        try {
          const conv = await fileService.readJSON<Conversation>(convPath);
          let modified = false;

          // 遍历所有节点的附件
          for (const node of Object.values(conv.nodes)) {
            if (!node.attachments || node.attachments.length === 0) continue;

            for (let i = 0; i < node.attachments.length; i++) {
              const att = node.attachments[i];

              // 跳过已有 filePath 且无 data 的附件（已迁移）
              if (att.filePath && !att.data) continue;

              // 旧格式：data 必存在，filePath 可能不存在
              if (!att.data) continue;

              // 生成 filePath
              const ext = att.filename.split(".").pop()?.toLowerCase() || "bin";
              att.filePath = `${convId}/${att.id}.${ext}`;

              // 保存附件到磁盘
              try {
                await attachmentService.saveAttachment(projectId, convId, att);
              } catch (err) {
                console.warn(`[attachment-migration] 保存附件失败: ${att.id}`, err);
              }

              // 剥离 data（不再持久化到 JSON）
              node.attachments[i] = attachmentService.stripAttachmentData(att);
              modified = true;
            }
          }

          // 写回修改后的对话 JSON
          if (modified) {
            conv.updatedAt = Date.now();
            await fileService.writeJSON(convPath, conv);
            totalMigrated++;
          }
        } catch (err) {
          console.warn(`[attachment-migration] 处理对话失败: ${convId}`, err);
        }
      }
    }

    // 标记迁移完成
    await fileService.ensureDir(".migration-flags");
    await fileService.writeText(`.migration-flags/${MIGRATION_FLAG_KEY}`, new Date().toISOString());

    console.log(`[attachment-migration] 迁移完成，共处理 ${totalMigrated} 个对话`);
  } catch (err) {
    console.error("[attachment-migration] 迁移失败:", err);
    // 不抛出异常，允许应用继续运行
  }
}
