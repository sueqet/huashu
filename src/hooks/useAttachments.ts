import { useCallback, useState } from "react";
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

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(file);
  });
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

function isImageMime(mimeType: string): boolean {
  return IMAGE_MIME_TYPES.has(mimeType);
}

export function useAttachments(projectId: string, conversationId: string) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingError, setProcessingError] = useState<string | null>(null);

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

      await attachmentService.saveAttachment(projectId, conversationId, attachment);
      return attachment;
    },
    [conversationId, projectId]
  );

  const appendAttachment = useCallback((attachment: Attachment) => {
    setAttachments((prev) => [...prev, attachment]);
  }, []);

  const runWithProcessing = useCallback(
    async (task: () => Promise<void>, fallbackError: string) => {
      setIsProcessing(true);
      setProcessingError(null);

      try {
        await task();
      } catch (err) {
        console.warn(fallbackError, err);
        setProcessingError(err instanceof Error ? err.message : fallbackError);
      } finally {
        setIsProcessing(false);
      }
    },
    []
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files || []).filter((file) =>
        file.type.startsWith("image/")
      );
      if (files.length === 0) return;

      e.preventDefault();
      void runWithProcessing(async () => {
        for (const file of files) {
          const attachment = await createAndSaveAttachment(
            "image",
            `pasted_${Date.now()}.png`,
            file.type || "image/png",
            await fileToDataUrl(file),
            file.size
          );
          appendAttachment(attachment);
        }
      }, "Failed to paste image");
    },
    [appendAttachment, createAndSaveAttachment, runWithProcessing]
  );

  const pickImages = useCallback(async () => {
    const selected = await open({
      multiple: true,
      filters: [{ name: "Images", extensions: IMAGE_EXTENSIONS }],
    });
    if (!selected) return;

    const paths = Array.isArray(selected) ? selected : [selected];
    void runWithProcessing(async () => {
      for (const filePath of paths) {
        const bytes = await readFile(filePath);
        const filename = filePath.split(/[/\\]/).pop() || "image";
        const mimeType = getMimeType(filename);
        const attachment = await createAndSaveAttachment(
          "image",
          filename,
          mimeType,
          fileToBase64(new Uint8Array(bytes), mimeType),
          bytes.length
        );
        appendAttachment(attachment);
      }
    }, "Failed to read image");
  }, [appendAttachment, createAndSaveAttachment, runWithProcessing]);

  const pickDocuments = useCallback(async () => {
    const selected = await open({
      multiple: true,
      filters: [{ name: "Documents", extensions: DOC_EXTENSIONS }],
    });
    if (!selected) return;

    const paths = Array.isArray(selected) ? selected : [selected];
    void runWithProcessing(async () => {
      for (const filePath of paths) {
        const bytes = await readFile(filePath);
        const filename = filePath.split(/[/\\]/).pop() || "document";
        const attachment = await createAndSaveAttachment(
          "document",
          filename,
          getMimeType(filename),
          await parseDocument(new Uint8Array(bytes), filename),
          bytes.length
        );
        appendAttachment(attachment);
      }
    }, "Failed to parse document");
  }, [appendAttachment, createAndSaveAttachment, runWithProcessing]);

  const addFiles = useCallback(
    async (files: File[]) => {
      await runWithProcessing(async () => {
        for (const file of files) {
          const mimeType = file.type || getMimeType(file.name);

          if (isImageMime(mimeType)) {
            const attachment = await createAndSaveAttachment(
              "image",
              file.name,
              mimeType,
              await fileToDataUrl(file),
              file.size
            );
            appendAttachment(attachment);
          } else {
            const buffer = await file.arrayBuffer();
            const attachment = await createAndSaveAttachment(
              "document",
              file.name,
              mimeType,
              await parseDocument(new Uint8Array(buffer), file.name),
              file.size
            );
            appendAttachment(attachment);
          }
        }
      }, "Failed to process dropped file");
    },
    [appendAttachment, createAndSaveAttachment, runWithProcessing]
  );

  const removeAttachment = useCallback(
    async (id: string) => {
      setAttachments((prev) => {
        const attachment = prev.find((item) => item.id === id);
        if (attachment) {
          attachmentService.deleteAttachment(projectId, attachment).catch((err) => {
            console.warn("Failed to delete attachment", err);
          });
        }
        return prev.filter((item) => item.id !== id);
      });
    },
    [projectId]
  );

  const clearAttachments = useCallback(() => {
    setAttachments([]);
    setProcessingError(null);
  }, []);

  const clearProcessingError = useCallback(() => {
    setProcessingError(null);
  }, []);

  return {
    attachments,
    isProcessing,
    processingError,
    clearProcessingError,
    handlePaste,
    pickImages,
    pickDocuments,
    addFiles,
    removeAttachment,
    clearAttachments,
  };
}
