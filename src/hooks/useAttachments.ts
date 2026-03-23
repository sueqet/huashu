import { useState, useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import type { Attachment } from "@/types";
import { parseDocument } from "@/services/document-parser";

const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "bmp"];
const DOC_EXTENSIONS = ["txt", "md", "pdf", "docx", "html", "htm", "csv", "log"];

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

export function useAttachments() {
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  /** 处理 Ctrl+V 粘贴图片 */
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.type.startsWith("image/")) continue;

      e.preventDefault();
      const file = item.getAsFile();
      if (!file) continue;

      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const attachment: Attachment = {
          id: uuidv4(),
          type: "image",
          filename: `粘贴图片_${Date.now()}.png`,
          mimeType: file.type,
          data: dataUrl,
          size: file.size,
        };
        setAttachments((prev) => [...prev, attachment]);
      };
      reader.readAsDataURL(file);
    }
  }, []);

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
        const attachment: Attachment = {
          id: uuidv4(),
          type: "image",
          filename,
          mimeType,
          data: dataUrl,
          size: bytes.length,
        };
        setAttachments((prev) => [...prev, attachment]);
      } catch (err) {
        console.warn("读取图片失败:", err);
      }
    }
  }, []);

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
        const attachment: Attachment = {
          id: uuidv4(),
          type: "document",
          filename,
          mimeType: getMimeType(filename),
          data: text,
          size: bytes.length,
        };
        setAttachments((prev) => [...prev, attachment]);
      } catch (err) {
        console.warn("解析文档失败:", err);
      }
    }
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const clearAttachments = useCallback(() => {
    setAttachments([]);
  }, []);

  return {
    attachments,
    handlePaste,
    pickImages,
    pickDocuments,
    removeAttachment,
    clearAttachments,
  };
}
