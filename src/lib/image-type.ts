/**
 * 根据文件头识别图片格式。
 * 安卓文件选择器返回的 content:// 地址通常没有扩展名，不能依赖文件名判断。
 */
export function detectImageExtension(bytes: Uint8Array): "png" | "jpg" | "gif" | "webp" | null {
  const startsWith = (sig: number[], offset = 0) => sig.every((b, i) => bytes[offset + i] === b);
  if (startsWith([0x89, 0x50, 0x4e, 0x47])) return "png";
  if (startsWith([0xff, 0xd8, 0xff])) return "jpg";
  if (startsWith([0x47, 0x49, 0x46, 0x38])) return "gif";
  if (startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8)) return "webp";
  return null;
}
