import type { AttachmentType } from "../types/node";

export type AttachmentPreviewKind = "image" | "text";

export function getAttachmentPreviewKind(type: AttachmentType): AttachmentPreviewKind {
  return type === "image" ? "image" : "text";
}

