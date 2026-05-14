const DEFAULT_IMAGE_SIZE = "1024x1024";
const IMAGE_SIZE_PATTERN = /^(\d{1,5})\s*x\s*(\d{1,5})$/i;

const EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/bmp": "bmp",
  "image/avif": "avif",
};

export interface GeneratedImageMetadata {
  mimeType: string;
  extension: string;
  filename: string;
  size: number;
}

export function normalizeImageSize(
  size: string | undefined,
  fallback = DEFAULT_IMAGE_SIZE
): string {
  const match = size?.trim().match(IMAGE_SIZE_PATTERN);
  if (!match) return fallback;

  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    return fallback;
  }

  return `${width}x${height}`;
}

function getDataUrlPayloadSize(dataUrl: string): number {
  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex === -1) return 0;
  const payload = dataUrl.slice(commaIndex + 1).trim();
  if (!payload) return 0;
  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((payload.length * 3) / 4) - padding);
}

export function getGeneratedImageMetadata(
  dataUrl: string,
  timestamp = Date.now()
): GeneratedImageMetadata {
  const match = dataUrl.match(/^data:([^;,]+)[;,]/);
  const mimeType = match?.[1]?.toLowerCase() || "image/png";
  const extension = EXTENSION_BY_MIME_TYPE[mimeType] || "png";

  return {
    mimeType,
    extension,
    filename: `generated_${timestamp}.${extension}`,
    size: getDataUrlPayloadSize(dataUrl),
  };
}
