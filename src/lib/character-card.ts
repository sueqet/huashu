/**
 * SillyTavern 角色卡格式支持（纯逻辑，不依赖 Tauri）
 *
 * - JSON：V1（扁平字段）、V2（spec: chara_card_v2）、V3（spec: chara_card_v3）
 * - PNG：tEXt 块 "ccv3"（V3）或 "chara"（V2/V1），内容为 base64 编码的 UTF-8 JSON
 */
import type { CharacterCard } from "../types/character";

/** 卡片中可从文件解析出的内容（不含 id、时间戳、头像等本地字段） */
export type CharacterCardContent = Omit<
  CharacterCard,
  "schemaVersion" | "id" | "avatar" | "createdAt" | "updatedAt"
>;

/* ========== JSON 解析与导出 ========== */

const KNOWN_DATA_FIELDS = new Set([
  "name",
  "description",
  "personality",
  "scenario",
  "first_mes",
  "mes_example",
  "creator_notes",
  "system_prompt",
  "post_history_instructions",
  "alternate_greetings",
  "character_book",
  "tags",
  "creator",
  "character_version",
  "extensions",
]);

const str = (value: unknown): string => (typeof value === "string" ? value : "");
const strList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

export function emptyCharacterContent(name = ""): CharacterCardContent {
  return {
    name,
    description: "",
    personality: "",
    scenario: "",
    firstMessage: "",
    alternateGreetings: [],
    exampleDialogue: "",
    systemPrompt: "",
    postHistoryInstructions: "",
    creatorNotes: "",
    tags: [],
    creator: "",
    characterVersion: "",
    extensions: {},
    extra: {},
  };
}

/**
 * 解析 ST 角色卡 JSON（V1/V2/V3）。无法识别时抛出错误。
 */
export function parseCharacterCardJson(input: unknown): CharacterCardContent {
  if (!isRecord(input)) {
    throw new Error("角色卡格式无效：应为 JSON 对象");
  }

  const isWrapped =
    (input.spec === "chara_card_v2" || input.spec === "chara_card_v3") && isRecord(input.data);
  const data = isWrapped ? (input.data as Record<string, unknown>) : input;

  const name = str(data.name).trim();
  if (!name) {
    throw new Error("角色卡缺少名称（name）");
  }

  const extra: Record<string, unknown> = {};
  if (isWrapped) {
    for (const [key, value] of Object.entries(data)) {
      if (!KNOWN_DATA_FIELDS.has(key)) extra[key] = value;
    }
  }

  return {
    name,
    description: str(data.description),
    personality: str(data.personality),
    scenario: str(data.scenario),
    firstMessage: str(data.first_mes),
    alternateGreetings: strList(data.alternate_greetings),
    exampleDialogue: str(data.mes_example),
    systemPrompt: str(data.system_prompt),
    postHistoryInstructions: str(data.post_history_instructions),
    // V1 卡片把作者备注放在 creatorcomment
    creatorNotes: str(data.creator_notes) || str(input.creatorcomment),
    tags: strList(data.tags),
    creator: str(data.creator),
    characterVersion: str(data.character_version),
    ...(data.character_book !== undefined && data.character_book !== null
      ? { characterBook: data.character_book }
      : {}),
    extensions: isRecord(data.extensions) ? data.extensions : {},
    extra,
  };
}

function toV2Data(card: CharacterCardContent): Record<string, unknown> {
  return {
    name: card.name,
    description: card.description,
    personality: card.personality,
    scenario: card.scenario,
    first_mes: card.firstMessage,
    mes_example: card.exampleDialogue,
    creator_notes: card.creatorNotes,
    system_prompt: card.systemPrompt,
    post_history_instructions: card.postHistoryInstructions,
    alternate_greetings: card.alternateGreetings,
    ...(card.characterBook !== undefined ? { character_book: card.characterBook } : {}),
    tags: card.tags,
    creator: card.creator,
    character_version: card.characterVersion,
    extensions: card.extensions,
  };
}

/** 导出为 V2 卡片（同时带上 V1 顶层字段，兼容旧版工具） */
export function toCharacterCardV2(card: CharacterCardContent): Record<string, unknown> {
  return {
    name: card.name,
    description: card.description,
    personality: card.personality,
    scenario: card.scenario,
    first_mes: card.firstMessage,
    mes_example: card.exampleDialogue,
    spec: "chara_card_v2",
    spec_version: "2.0",
    data: toV2Data(card),
  };
}

/** 导出为 V3 卡片 */
export function toCharacterCardV3(card: CharacterCardContent): Record<string, unknown> {
  return {
    spec: "chara_card_v3",
    spec_version: "3.0",
    data: {
      group_only_greetings: [],
      ...card.extra,
      ...toV2Data(card),
    },
  };
}

/* ========== base64 / UTF-8 ========== */

function utf8ToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function base64ToUtf8(base64: string): string {
  const binary = atob(base64.trim());
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder("utf-8").decode(bytes);
}

/* ========== PNG 文本块 ========== */

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const CARD_KEYWORDS = new Set(["chara", "ccv3"]);

let crcTable: Uint32Array | null = null;
export function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export function isPng(bytes: Uint8Array): boolean {
  return bytes.length >= 8 && PNG_SIGNATURE.every((b, i) => bytes[i] === b);
}

interface PngChunk {
  type: string;
  /** 整个块（含长度、类型、数据、CRC）在文件中的起止位置 */
  start: number;
  end: number;
  data: Uint8Array;
}

function readChunks(bytes: Uint8Array): PngChunk[] {
  if (!isPng(bytes)) throw new Error("不是有效的 PNG 文件");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunks: PngChunk[] = [];
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    const typeStart = offset + 4;
    const dataStart = offset + 8;
    const end = dataStart + length + 4;
    if (end > bytes.length) throw new Error("PNG 文件已损坏");
    const type = String.fromCharCode(...bytes.subarray(typeStart, dataStart));
    chunks.push({ type, start: offset, end, data: bytes.subarray(dataStart, dataStart + length) });
    offset = end;
    if (type === "IEND") break;
  }
  return chunks;
}

const latin1 = (bytes: Uint8Array): string => {
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
  return out;
};

/** 读取 PNG 中所有 tEXt 块（keyword → text） */
export function readPngTextChunks(bytes: Uint8Array): Record<string, string> {
  const result: Record<string, string> = {};
  for (const chunk of readChunks(bytes)) {
    if (chunk.type !== "tEXt") continue;
    const separator = chunk.data.indexOf(0);
    if (separator <= 0) continue;
    result[latin1(chunk.data.subarray(0, separator))] = latin1(chunk.data.subarray(separator + 1));
  }
  return result;
}

function buildTextChunk(keyword: string, text: string): Uint8Array {
  // CRC 覆盖“类型 + 数据”，所以先拼出这一段
  const typeAndData = new Uint8Array(4 + keyword.length + 1 + text.length);
  typeAndData.set([0x74, 0x45, 0x58, 0x74], 0); // "tEXt"
  for (let i = 0; i < keyword.length; i++) typeAndData[4 + i] = keyword.charCodeAt(i);
  typeAndData[4 + keyword.length] = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code > 0xff) throw new Error("tEXt 内容必须是 Latin-1 字符");
    typeAndData[4 + keyword.length + 1 + i] = code;
  }
  const chunk = new Uint8Array(4 + typeAndData.length + 4);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, typeAndData.length - 4);
  chunk.set(typeAndData, 4);
  view.setUint32(4 + typeAndData.length, crc32(typeAndData));
  return chunk;
}

/** 写入（替换）角色卡文本块，插在 IEND 之前 */
export function writeCardChunks(png: Uint8Array, entries: Record<string, string>): Uint8Array {
  const chunks = readChunks(png);
  const iend = chunks.find((c) => c.type === "IEND");
  if (!iend) throw new Error("PNG 文件缺少 IEND 块");

  const parts: Uint8Array[] = [png.subarray(0, 8)];
  for (const chunk of chunks) {
    if (chunk.type === "IEND") break;
    if (chunk.type === "tEXt") {
      const separator = chunk.data.indexOf(0);
      const keyword = separator > 0 ? latin1(chunk.data.subarray(0, separator)) : "";
      if (CARD_KEYWORDS.has(keyword) || keyword in entries) continue;
    }
    parts.push(png.subarray(chunk.start, chunk.end));
  }
  for (const [keyword, text] of Object.entries(entries)) {
    parts.push(buildTextChunk(keyword, text));
  }
  parts.push(png.subarray(iend.start, iend.end));

  const out = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/* ========== 文件级导入导出 ========== */

function parseCardText(text: string): CharacterCardContent {
  const trimmed = text.trim();
  const json = trimmed.startsWith("{") ? trimmed : base64ToUtf8(trimmed);
  return parseCharacterCardJson(JSON.parse(json));
}

/** 从 PNG 字节中读取角色卡；优先 V3（ccv3），其次 V2/V1（chara） */
export function parseCharacterCardPng(png: Uint8Array): CharacterCardContent {
  const texts = readPngTextChunks(png);
  const errors: string[] = [];
  for (const keyword of ["ccv3", "chara"]) {
    if (!texts[keyword]) continue;
    try {
      return parseCardText(texts[keyword]);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  throw new Error(errors[0] || "这张图片里没有角色卡数据");
}

/** 把角色卡写入 PNG（同时写 chara=V2 与 ccv3=V3，兼容新旧工具） */
export function embedCharacterCardInPng(png: Uint8Array, card: CharacterCardContent): Uint8Array {
  return writeCardChunks(png, {
    chara: utf8ToBase64(JSON.stringify(toCharacterCardV2(card))),
    ccv3: utf8ToBase64(JSON.stringify(toCharacterCardV3(card))),
  });
}

/* ========== 宏替换 ========== */

export interface MacroContext {
  char: string;
  user: string;
}

/** 替换 {{char}} / {{user}} 及旧式 <BOT> / <USER>（不区分大小写） */
export function applyMacros(text: string, ctx: MacroContext): string {
  return text
    .replace(/\{\{\s*char\s*\}\}|<BOT>/gi, ctx.char)
    .replace(/\{\{\s*user\s*\}\}|<USER>/gi, ctx.user);
}

/** 把 <START> 分隔的示例对话整理成若干段，并替换宏 */
export function formatExampleDialogue(text: string, ctx: MacroContext): string[] {
  return text
    .split(/<START>/i)
    .map((block) => applyMacros(block, ctx).trim())
    .filter(Boolean);
}
