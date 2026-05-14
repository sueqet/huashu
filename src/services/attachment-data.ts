import type { Attachment } from "../types/node";

/** base64 data URL to bytes */
export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",")[1];
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/** bytes to base64 data URL */
export function bytesToDataUrl(bytes: Uint8Array, mimeType: string): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}

export function attachmentBytesToData(
  attachment: Attachment,
  bytes: Uint8Array
): string {
  if (attachment.type === "image") {
    return bytesToDataUrl(bytes, attachment.mimeType);
  }

  return new TextDecoder().decode(bytes);
}

