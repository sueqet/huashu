import { readFile, writeFile } from "@tauri-apps/plugin-fs";
import { BaseDirectory } from "@tauri-apps/plugin-fs";
import { fileService } from "./file-service";
import type { Attachment } from "@/types";

const BASE_DIR = BaseDirectory.AppData;

function attachmentsDir(projectId: string): string {
  return `projects/${projectId}/attachments`;
}

function attachmentPath(projectId: string, convId: string, attId: string, ext: string): string {
  return `${attachmentsDir(projectId)}/${convId}/${attId}.${ext}`;
}

function resolveAttachmentPath(projectId: string, attachment: Attachment): string {
  if (attachment.filePath) {
    return `${attachmentsDir(projectId)}/${attachment.filePath}`;
  }

  const ext = getExt(attachment.filename);
  return attachmentPath(projectId, "", attachment.id, ext);
}

/** 从文件名提取扩展名 */
function getExt(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() || "bin";
}

/** base64 data URL 转 Uint8Array */
function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",")[1];
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/** bytes 转 base64 data URL */
function bytesToDataUrl(bytes: Uint8Array, mimeType: string): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}

export const attachmentService = {
  /**
   * 保存附件到磁盘（base64 解码写入文件）
   */
  async saveAttachment(
    projectId: string,
    convId: string,
    attachment: Attachment
  ): Promise<void> {
    const ext = getExt(attachment.filename);
    const dir = `${attachmentsDir(projectId)}/${convId}`;
    await fileService.ensureDir(dir);

    const path = attachmentPath(projectId, convId, attachment.id, ext);

    if (attachment.type === "image" && attachment.data) {
      // 图片：从 base64 data URL 解码写入
      const bytes = dataUrlToBytes(attachment.data);
      await writeFile(path, bytes, { baseDir: BASE_DIR });
    } else if (attachment.type === "document" && attachment.data) {
      // 文档：写入解析后的文本
      await writeFile(path, new TextEncoder().encode(attachment.data), { baseDir: BASE_DIR });
    }
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

    const path = resolveAttachmentPath(projectId, attachment);

    if (attachment.type === "image") {
      const bytes = await readFile(path, { baseDir: BASE_DIR });
      attachment.data = bytesToDataUrl(new Uint8Array(bytes), attachment.mimeType);
    } else {
      const bytes = await readFile(path, { baseDir: BASE_DIR });
      attachment.data = new TextDecoder().decode(bytes);
    }

    return attachment.data;
  },

  /**
   * 删除单个附件文件
   */
  async deleteAttachment(
    projectId: string,
    attachment: Attachment
  ): Promise<void> {
    const path = resolveAttachmentPath(projectId, attachment);
    await fileService.removeFile(path);
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
