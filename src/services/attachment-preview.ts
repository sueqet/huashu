import type { AttachmentType } from "../types/node";

export type AttachmentPreviewKind = "image" | "text" | "pdf" | "docx";

export function getAttachmentPreviewKind(
  type: AttachmentType,
  filename: string,
  mimeType: string
): AttachmentPreviewKind {
  if (type === "image") return "image";

  const normalizedMimeType = mimeType.trim().toLowerCase();
  const ext = filename.split(".").pop()?.toLowerCase() || "";

  if (normalizedMimeType === "application/pdf" || ext === "pdf") {
    return "pdf";
  }

  if (
    normalizedMimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    ext === "docx"
  ) {
    return "docx";
  }

  return "text";
}

