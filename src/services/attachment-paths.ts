import type { Attachment } from "@/types";

export function attachmentsDir(projectId: string): string {
  return `projects/${projectId}/attachments`;
}

export function getAttachmentExtension(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() || "bin";
}

export function buildAttachmentPath(
  projectId: string,
  convId: string,
  attId: string,
  ext: string
): string {
  const dir = convId ? `${attachmentsDir(projectId)}/${convId}` : attachmentsDir(projectId);
  return `${dir}/${attId}.${ext}`;
}

export function resolveAttachmentDataPath(
  projectId: string,
  attachment: Attachment
): string {
  if (attachment.filePath) {
    return `${attachmentsDir(projectId)}/${attachment.filePath}`;
  }

  return buildAttachmentPath(
    projectId,
    "",
    attachment.id,
    getAttachmentExtension(attachment.filename)
  );
}

export function resolveAttachmentOriginalPath(
  projectId: string,
  attachment: Attachment
): string {
  if (attachment.originalFilePath) {
    return `${attachmentsDir(projectId)}/${attachment.originalFilePath}`;
  }

  return resolveAttachmentDataPath(projectId, attachment);
}

export function resolveAttachmentTextPath(
  projectId: string,
  attachment: Attachment
): string {
  if (attachment.textFilePath) {
    return `${attachmentsDir(projectId)}/${attachment.textFilePath}`;
  }

  return resolveAttachmentDataPath(projectId, attachment);
}

export function formatAttachmentReadError(
  projectId: string,
  attachment: Attachment,
  resolvedPath: string,
  cause: unknown
): Error {
  const message = cause instanceof Error ? cause.message : String(cause);
  return new Error(
    `读取附件失败: ${attachment.filename} (${attachment.id}) ` +
      `project=${projectId} filePath=${attachment.filePath || "<empty>"} ` +
      `resolved=${resolvedPath}: ${message}`
  );
}
