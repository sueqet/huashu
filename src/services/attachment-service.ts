import { readFile, writeFile } from "@tauri-apps/plugin-fs";
import { BaseDirectory } from "@tauri-apps/plugin-fs";
import { fileService } from "./file-service";
import type { Attachment } from "@/types";
import { attachmentBytesToData, dataUrlToBytes } from "./attachment-data";
import {
  attachmentsDir,
  buildAttachmentPath,
  formatAttachmentReadError,
  getAttachmentExtension,
  resolveAttachmentDataPath,
  resolveAttachmentOriginalPath,
  resolveAttachmentTextPath,
} from "./attachment-paths";

const BASE_DIR = BaseDirectory.AppData;

export const attachmentService = {
  /**
   * 保存附件到磁盘（base64 解码写入文件）
   */
  async saveAttachment(
    projectId: string,
    convId: string,
    attachment: Attachment
  ): Promise<void> {
    const ext = getAttachmentExtension(attachment.filename);
    const dir = `${attachmentsDir(projectId)}/${convId}`;
    await fileService.ensureDir(dir);

    const path = buildAttachmentPath(projectId, convId, attachment.id, ext);

    if (attachment.type === "image" && attachment.data) {
      // 图片：从 base64 data URL 解码写入
      const bytes = dataUrlToBytes(attachment.data);
      await writeFile(path, bytes, { baseDir: BASE_DIR });
    } else if (attachment.type === "document" && attachment.data) {
      // 文档：写入解析后的文本
      await writeFile(path, new TextEncoder().encode(attachment.data), { baseDir: BASE_DIR });
    }
  },

  async saveDocumentAttachment(
    projectId: string,
    convId: string,
    attachment: Attachment,
    originalBytes: Uint8Array,
    text: string
  ): Promise<void> {
    const dir = `${attachmentsDir(projectId)}/${convId}`;
    await fileService.ensureDir(dir);

    await writeFile(resolveAttachmentOriginalPath(projectId, attachment), originalBytes, {
      baseDir: BASE_DIR,
    });
    await writeFile(
      resolveAttachmentTextPath(projectId, attachment),
      new TextEncoder().encode(text),
      { baseDir: BASE_DIR }
    );
  },

  /**
   * 从磁盘读取附件数据，缓存到 attachment.data
   */
  async readAttachmentData(
    projectId: string,
    attachment: Attachment
  ): Promise<string> {
    // 已缓存则直接返回
    if (attachment.data) return attachment.data;

    const path = attachment.type === "document"
      ? resolveAttachmentTextPath(projectId, attachment)
      : resolveAttachmentDataPath(projectId, attachment);

    try {
      const bytes = await readFile(path, { baseDir: BASE_DIR });
      return attachmentBytesToData(attachment, new Uint8Array(bytes));
    } catch (err) {
      throw formatAttachmentReadError(projectId, attachment, path, err);
    }
  },

  /**
   * 从磁盘读取附件原始字节，用于导出/下载。
   */
  async readAttachmentBytes(
    projectId: string,
    attachment: Attachment
  ): Promise<Uint8Array> {
    if (attachment.data && attachment.type === "image") {
      return dataUrlToBytes(attachment.data);
    }

    const path = resolveAttachmentOriginalPath(projectId, attachment);
    try {
      return new Uint8Array(await readFile(path, { baseDir: BASE_DIR }));
    } catch (err) {
      throw formatAttachmentReadError(projectId, attachment, path, err);
    }
  },

  /**
   * 删除单个附件文件
   */
  async deleteAttachment(
    projectId: string,
    attachment: Attachment
  ): Promise<void> {
    const paths = new Set([
      resolveAttachmentDataPath(projectId, attachment),
      resolveAttachmentOriginalPath(projectId, attachment),
      resolveAttachmentTextPath(projectId, attachment),
    ]);

    await Promise.all(Array.from(paths).map((path) => fileService.removeFile(path)));
  },

  /**
   * 删除整个对话的附件目录
   */
  async deleteConversationAttachments(
    projectId: string,
    convId: string
  ): Promise<void> {
    const dir = `${attachmentsDir(projectId)}/${convId}`;
    await fileService.removeDir(dir);
  },

  /**
   * 序列化前剥离附件 data（仅保留 filePath）
   */
  stripAttachmentData(attachment: Attachment): Attachment {
    const { data, ...rest } = attachment;
    return rest;
  },
};
