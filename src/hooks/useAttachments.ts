import { useState, useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import type { Attachment, AttachmentType } from "@/types";
import { parseDocument } from "@/services/document-parser";
import { attachmentService } from "@/services/attachment-service";

const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "bmp"];
const DOC_EXTENSIONS = ["txt", "md", "pdf", "docx", "html", "htm", "csv", "log"];

const IMAGE_MIME_TYPES = new Set([
  "image/png", "image/jpeg", "image/gif", "image/webp", "image/bmp",
]);

function fileToBase64(bytes: Uint8Array, mimeType: string): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}

function getMimeType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    bmp: "image/bmp",
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    txt: "text/plain",
    md: "text/markdown",
    html: "text/html",
    htm: "text/html",
    csv: "text/csv",
    log: "text/plain",
  };
  return map[ext] || "application/octet-stream";
}

/** 判断文件是否为图片类型 */
function isImageMime(mimeType: string): boolean {
  return IMAGE_MIME_TYPES.has(mimeType);
}

export function useAttachments(projectId: string, conversationId: string) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  /** 创建附件并保存到磁盘 */
  const createAndSaveAttachment = useCallback(
    async (
      type: AttachmentType,
      filename: string,
      mimeType: string,
      data: string,
      size: number
    ): Promise<Attachment> => {
      const id = uuidv4();
      const ext = filename.split(".").pop()?.toLowerCase() || "bin";
      const filePath = `${conversationId}/${id}.${ext}`;

      const attachment: Attachment = {
        id,
        type,
        filename,
        mimeType,
        filePath,
        size,
        data,
      };

      // 保存到磁盘
      try {
        await attachmentService.saveAttachment(projectId, conversationId, attachment);
      } catch (err) {
        console.warn("保存附件到磁盘失败:", err);
      }

      return attachment;
    },
    [projectId, conversationId]
  );

  /** 处理 Ctrl+V 粘贴图片 */
  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (!item.type.startsWith("image/")) continue;

        e.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;

        const reader = new FileReader();
        reader.onload = async () => {
          const dataUrl = reader.result as string;
          const attachment = await createAndSaveAttachment(
            "image",
            `粘贴图片_${Date.now()}.png`,
            file.type,
            dataUrl,
            file.size
          );
          setAttachments((prev) => [...prev, attachment]);
        };
        reader.readAsDataURL(file);
      }
    },
    [createAndSaveAttachment]
  );

  /** 通过 Tauri dialog 选择图片文件 */
  const pickImages = useCallback(async () => {
    const selected = await open({
      multiple: true,
      filters: [
        {
          name: "图片",
          extensions: IMAGE_EXTENSIONS,
        },
      ],
    });
    if (!selected) return;

    const paths = Array.isArray(selected) ? selected : [selected];
    for (const filePath of paths) {
      try {
        const bytes = await readFile(filePath);
        const filename = filePath.split(/[/\\]/).pop() || "image";
        const mimeType = getMimeType(filename);
        const dataUrl = fileToBase64(new Uint8Array(bytes), mimeType);
        const attachment = await createAndSaveAttachment(
          "image",
          filename,
          mimeType,
          dataUrl,
          bytes.length
        );
        setAttachments((prev) => [...prev, attachment]);
      } catch (err) {
        console.warn("读取图片失败:", err);
      }
    }
  }, [createAndSaveAttachment]);

  /** 通过 Tauri dialog 选择文档并解析为文本 */
  const pickDocuments = useCallback(async () => {
    const selected = await open({
      multiple: true,
      filters: [
        {
          name: "文档",
          extensions: DOC_EXTENSIONS,
        },
      ],
    });
    if (!selected) return;

    const paths = Array.isArray(selected) ? selected : [selected];
    for (const filePath of paths) {
      try {
        const bytes = await readFile(filePath);
        const filename = filePath.split(/[/\\]/).pop() || "document";
        const text = await parseDocument(new Uint8Array(bytes), filename);
        const attachment = await createAndSaveAttachment(
          "document",
          filename,
          getMimeType(filename),
          text,
          bytes.length
        );
        setAttachments((prev) => [...prev, attachment]);
      } catch (err) {
        console.warn("解析文档失败:", err);
      }
    }
  }, [createAndSaveAttachment]);

  /** 添加文件（拖拽上传用） */
  const addFiles = useCallback(
    async (files: File[]) => {
      for (const file of files) {
        try {
          const mimeType = file.type || getMimeType(file.name);
          const isImage = isImageMime(mimeType);

          if (isImage) {
            const dataUrl = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.readAsDataURL(file);
            });
            const attachment = await createAndSaveAttachment(
              "image",
              file.name,
              mimeType,
              dataUrl,
              file.size
            );
            setAttachments((prev) => [...prev, attachment]);
          } else {
            const buffer = await file.arrayBuffer();
            const text = await parseDocument(new Uint8Array(buffer), file.name);
            const attachment = await createAndSaveAttachment(
              "document",
              file.name,
              mimeType,
              text,
              file.size
            );
            setAttachments((prev) => [...prev, attachment]);
          }
        } catch (err) {
          console.warn("处理文件失败:", file.name, err);
        }
      }
    },
    [createAndSaveAttachment]
  );

  const removeAttachment = useCallback(
    async (id: string) => {
      setAttachments((prev) => {
        const att = prev.find((a) => a.id === id);
        if (att) {
          // 异步删除磁盘文件（不阻塞 UI）
          attachmentService.deleteAttachment(projectId, att).catch((err) => {
            console.warn("删除附件文件失败:", err);
          });
        }
        return prev.filter((a) => a.id !== id);
      });
    },
    [projectId]
  );

  const clearAttachments = useCallback(() => {
    // 清理时不删除磁盘文件（可能已用于已发送的消息）
    setAttachments([]);
  }, []);

  return {
    attachments,
    handlePaste,
    pickImages,
    pickDocuments,
    addFiles,
    removeAttachment,
    clearAttachments,
  };
}
