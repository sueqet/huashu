export interface MultimodalTarget {
  apiUrl?: string;
  model?: string;
}

const SUPPORTED_IMAGE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
  "image/bmp",
  "image/avif",
  "image/heic",
  "image/heif",
]);

const GEMINI_SUPPORTED_IMAGE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/heic",
  "image/heif",
]);

const SAFE_IMAGE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
]);

function normalizeMimeType(mimeType: string): string {
  return mimeType.trim().toLowerCase();
}

function isGeminiTarget(target: MultimodalTarget): boolean {
  const apiUrl = target.apiUrl?.toLowerCase() || "";
  const model = target.model?.toLowerCase() || "";
  return apiUrl.includes("generativelanguage.googleapis.com") || model.startsWith("gemini");
}

export function isImageMimeType(mimeType: string): boolean {
  const normalized = normalizeMimeType(mimeType);
  return normalized.startsWith("image/") || SUPPORTED_IMAGE_MIME_TYPES.has(normalized);
}

export function extractMimeTypeFromDataUrl(url: string): string | null {
  if (!url.startsWith("data:")) return null;
  const separatorIndex = url.indexOf(",");
  const metadata = separatorIndex === -1 ? url : url.slice(0, separatorIndex);
  const mimeType = metadata.slice(5).split(";")[0];
  return mimeType ? normalizeMimeType(mimeType) : null;
}

export function isModelCompatibleImageMimeType(
  mimeType: string,
  target: MultimodalTarget
): boolean {
  const normalizedMimeType = normalizeMimeType(mimeType);
  if (!normalizedMimeType) return true;
  if (!isImageMimeType(normalizedMimeType)) return true;

  if (isGeminiTarget(target)) {
    return GEMINI_SUPPORTED_IMAGE_MIME_TYPES.has(normalizedMimeType);
  }

  return true;
}

export function shouldTranscodeImageForModel(
  mimeType: string,
  target: MultimodalTarget
): boolean {
  const normalizedMimeType = normalizeMimeType(mimeType);
  if (!isImageMimeType(normalizedMimeType)) return false;
  return !isModelCompatibleImageMimeType(normalizedMimeType, target);
}

export function getSafeImageMimeType(mimeType: string): string {
  const normalizedMimeType = normalizeMimeType(mimeType);
  if (SAFE_IMAGE_MIME_TYPES.has(normalizedMimeType)) {
    return normalizedMimeType === "image/jpg" ? "image/jpeg" : normalizedMimeType;
  }

  return "image/png";
}
