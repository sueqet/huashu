/**
 * 角色头像的浏览器端处理：转 PNG、生成占位头像（导出 PNG 角色卡时需要）
 */
import { bytesToDataUrl, dataUrlToBytes } from "./attachment-data";

const CARD_WIDTH = 400;
const CARD_HEIGHT = 600;

function canvasToPngBytes(canvas: HTMLCanvasElement): Uint8Array {
  return dataUrlToBytes(canvas.toDataURL("image/png"));
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = src;
  await image.decode();
  return image;
}

/** 把任意格式的图片字节转换为 PNG 字节 */
export async function convertToPng(bytes: Uint8Array, mimeType: string): Promise<Uint8Array> {
  const image = await loadImage(bytesToDataUrl(bytes, mimeType));
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("无法创建图片转换画布");
  context.drawImage(image, 0, 0);
  return canvasToPngBytes(canvas);
}

/** 没有头像时，生成一张以名字首字为图案的 PNG */
export function createPlaceholderAvatar(name: string): Uint8Array {
  const canvas = document.createElement("canvas");
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("无法创建头像画布");

  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  context.fillStyle = `hsl(${hash % 360}, 45%, 45%)`;
  context.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  context.fillStyle = "#ffffff";
  context.font = "bold 200px sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(Array.from(name.trim())[0] || "?", CARD_WIDTH / 2, CARD_HEIGHT / 2);
  return canvasToPngBytes(canvas);
}
