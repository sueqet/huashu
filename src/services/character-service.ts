import { readFile, writeFile, BaseDirectory } from "@tauri-apps/plugin-fs";
import { v4 as uuidv4 } from "uuid";
import type { CharacterCard } from "@/types";
import {
  embedCharacterCardInPng,
  emptyCharacterContent,
  isPng,
  parseCharacterCardJson,
  parseCharacterCardPng,
  toCharacterCardV2,
  type CharacterCardContent,
} from "@/lib/character-card";
import { detectImageExtension } from "@/lib/image-type";
import { bytesToDataUrl } from "./attachment-data";
import { convertToPng, createPlaceholderAvatar } from "./character-image";
import { fileService } from "./file-service";

const BASE_DIR = BaseDirectory.AppData;
const CHARACTERS_DIR = "library/characters";
const CURRENT_SCHEMA_VERSION = 1;

const AVATAR_MIME_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

const cardPath = (id: string) => `${CHARACTERS_DIR}/${id}.json`;
const avatarPath = (file: string) => `${CHARACTERS_DIR}/${file}`;
const avatarMime = (file: string) =>
  AVATAR_MIME_TYPES[file.split(".").pop()?.toLowerCase() || ""] || "image/png";

/** 头像 data URL 缓存，键包含 updatedAt，头像更换后自动失效 */
const avatarCache = new Map<string, string>();

function contentOf(card: CharacterCard): CharacterCardContent {
  const { schemaVersion: _v, id: _id, avatar: _a, createdAt: _c, updatedAt: _u, ...content } = card;
  return content;
}

/**
 * 角色库服务：角色卡保存在 library/characters/<id>.json，头像为同目录下的图片文件
 */
export const characterService = {
  async list(): Promise<CharacterCard[]> {
    const entries = await fileService.listDir(CHARACTERS_DIR);
    const cards: CharacterCard[] = [];
    for (const entry of entries) {
      if (!entry.isFile || !entry.name?.endsWith(".json")) continue;
      try {
        cards.push(await fileService.readJSON<CharacterCard>(`${CHARACTERS_DIR}/${entry.name}`));
      } catch {
        console.warn(`无法读取角色卡: ${entry.name}`);
      }
    }
    return cards.sort((a, b) => b.updatedAt - a.updatedAt);
  },

  async get(id: string): Promise<CharacterCard | null> {
    try {
      return await fileService.readJSON<CharacterCard>(cardPath(id));
    } catch {
      return null;
    }
  },

  /** 按给定顺序读取多张卡片，跳过已删除的 */
  async getMany(ids: string[]): Promise<CharacterCard[]> {
    const cards = await Promise.all(ids.map((id) => this.get(id)));
    return cards.filter((card): card is CharacterCard => card !== null);
  },

  async create(
    content: CharacterCardContent = emptyCharacterContent("新角色"),
    avatar?: { bytes: Uint8Array; ext: string }
  ): Promise<CharacterCard> {
    const now = Date.now();
    const card: CharacterCard = {
      ...content,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      id: uuidv4(),
      createdAt: now,
      updatedAt: now,
    };
    await fileService.ensureDir(CHARACTERS_DIR);
    if (avatar) {
      card.avatar = `${card.id}.${avatar.ext}`;
      await writeFile(avatarPath(card.avatar), avatar.bytes, { baseDir: BASE_DIR });
    }
    await fileService.writeJSON(cardPath(card.id), card);
    return card;
  },

  async save(card: CharacterCard): Promise<CharacterCard> {
    const updated = { ...card, updatedAt: Date.now() };
    await fileService.ensureDir(CHARACTERS_DIR);
    await fileService.writeJSON(cardPath(card.id), updated);
    return updated;
  },

  async remove(card: CharacterCard): Promise<void> {
    await fileService.removeFile(cardPath(card.id));
    if (card.avatar) await fileService.removeFile(avatarPath(card.avatar));
  },

  async setAvatar(card: CharacterCard, bytes: Uint8Array): Promise<CharacterCard> {
    const ext = detectImageExtension(bytes);
    if (!ext) throw new Error("不支持的图片格式（支持 PNG、JPG、GIF、WebP）");
    const file = `${card.id}.${ext}`;
    await fileService.ensureDir(CHARACTERS_DIR);
    await writeFile(avatarPath(file), bytes, { baseDir: BASE_DIR });
    if (card.avatar && card.avatar !== file) await fileService.removeFile(avatarPath(card.avatar));
    return this.save({ ...card, avatar: file });
  },

  async readAvatarDataUrl(card: CharacterCard): Promise<string | null> {
    if (!card.avatar) return null;
    const key = `${card.id}:${card.avatar}:${card.updatedAt}`;
    const cached = avatarCache.get(key);
    if (cached) return cached;
    try {
      const bytes = await readFile(avatarPath(card.avatar), { baseDir: BASE_DIR });
      const dataUrl = bytesToDataUrl(bytes, avatarMime(card.avatar));
      avatarCache.set(key, dataUrl);
      return dataUrl;
    } catch {
      return null;
    }
  },

  /**
   * 导入 SillyTavern 角色卡（PNG 或 JSON），保存为新角色。
   * 按文件内容判断格式：安卓返回的 content:// 地址通常没有扩展名。
   */
  async importFile(bytes: Uint8Array): Promise<CharacterCard> {
    if (isPng(bytes)) {
      return this.create(parseCharacterCardPng(bytes), { bytes, ext: "png" });
    }
    const text = new TextDecoder().decode(bytes).replace(/^\uFEFF/, "").trim();
    if (text.startsWith("{")) {
      return this.create(parseCharacterCardJson(JSON.parse(text)));
    }
    throw new Error("仅支持 PNG 或 JSON 格式的角色卡");
  },

  exportJson(card: CharacterCard): Uint8Array {
    return new TextEncoder().encode(JSON.stringify(toCharacterCardV2(contentOf(card)), null, 2));
  },

  /** 导出为 PNG 角色卡：用头像（必要时转为 PNG）或生成的占位图承载卡片数据 */
  async exportPng(card: CharacterCard): Promise<Uint8Array> {
    let png: Uint8Array | null = null;
    if (card.avatar) {
      try {
        const bytes = await readFile(avatarPath(card.avatar), { baseDir: BASE_DIR });
        png = isPng(bytes) ? bytes : await convertToPng(bytes, avatarMime(card.avatar));
      } catch (err) {
        console.warn("读取头像失败，使用占位图导出", err);
      }
    }
    return embedCharacterCardInPng(png ?? createPlaceholderAvatar(card.name), contentOf(card));
  },
};
