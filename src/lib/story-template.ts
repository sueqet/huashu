/**
 * 剧本模板（.huashu-story）解析与生成（纯逻辑，不依赖 Tauri）
 *
 * 2.0：内嵌完整的 SillyTavern V2 角色卡（可附带头像 data URL）
 * 1.0：角色只有名字和描述，导入时转换为角色卡
 */
import type { Persona } from "../types/character";
import type {
  NarrativeMode,
  StoryConfig,
  StoryTemplateFile,
  TemplateMeta,
} from "../types/story";
import {
  emptyCharacterContent,
  parseCharacterCardJson,
  toCharacterCardV2,
  type CharacterCardContent,
} from "./character-card.ts";

export interface TemplateCharacterContent {
  content: CharacterCardContent;
  /** 头像 data URL */
  avatar?: string;
}

/** 解析结果：故事设定（不含角色引用）+ 待写入角色库的角色 */
export interface ParsedStoryTemplate {
  config: Omit<StoryConfig, "characterIds" | "chapterSummaries">;
  characters: TemplateCharacterContent[];
  errors: string[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

function parseMeta(value: unknown): TemplateMeta | undefined {
  if (!isRecord(value)) return undefined;
  return {
    name: typeof value.name === "string" ? value.name : "未命名模板",
    author: typeof value.author === "string" ? value.author : "",
    version: typeof value.version === "string" ? value.version : "1.0",
    description: typeof value.description === "string" ? value.description : "",
  };
}

function parsePersona(value: unknown): Persona | undefined {
  if (!isRecord(value) || typeof value.name !== "string") return undefined;
  return { name: value.name, description: typeof value.description === "string" ? value.description : "" };
}

function parseCharacter(value: unknown, index: number, errors: string[]): TemplateCharacterContent | null {
  if (!isRecord(value)) {
    errors.push(`characters[${index}] 应为对象`);
    return null;
  }
  // 2.0：{ card, avatar? }
  if (isRecord(value.card)) {
    try {
      return {
        content: parseCharacterCardJson(value.card),
        ...(typeof value.avatar === "string" && value.avatar.startsWith("data:image/")
          ? { avatar: value.avatar }
          : {}),
      };
    } catch (err) {
      errors.push(`characters[${index}]: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }
  // 1.0：{ name, description }
  if (typeof value.name !== "string" || !value.name.trim()) {
    errors.push(`characters[${index}].name 应为字符串`);
    return null;
  }
  return {
    content: {
      ...emptyCharacterContent(value.name.trim()),
      description: typeof value.description === "string" ? value.description : "",
    },
  };
}

export function parseStoryTemplate(data: unknown): ParsedStoryTemplate {
  const errors: string[] = [];
  const empty: ParsedStoryTemplate = {
    config: { worldSetting: "", rules: "", openingMessage: "" },
    characters: [],
    errors,
  };

  if (!isRecord(data)) {
    errors.push("无效的模板数据：期望对象");
    return empty;
  }
  if (data.format !== "huashu-story-template") {
    errors.push("无效的模板格式：format 字段必须为 'huashu-story-template'");
    return empty;
  }

  for (const field of ["worldSetting", "rules", "openingMessage"] as const) {
    if (typeof data[field] !== "string") errors.push(`${field} 应为字符串`);
  }

  const characters = Array.isArray(data.characters)
    ? data.characters
        .map((c, i) => parseCharacter(c, i, errors))
        .filter((c): c is TemplateCharacterContent => c !== null)
    : (errors.push("characters 应为数组"), []);

  const narrativeMode: NarrativeMode | undefined =
    data.narrativeMode === "roleplay" || data.narrativeMode === "narrator" ? data.narrativeMode : undefined;
  const templateMeta = parseMeta(data.templateMeta);
  const persona = parsePersona(data.persona);

  return {
    config: {
      worldSetting: typeof data.worldSetting === "string" ? data.worldSetting : "",
      rules: typeof data.rules === "string" ? data.rules : "",
      openingMessage: typeof data.openingMessage === "string" ? data.openingMessage : "",
      ...(narrativeMode ? { narrativeMode } : {}),
      ...(persona ? { persona } : {}),
      ...(templateMeta ? { templateMeta } : {}),
    },
    characters,
    errors,
  };
}

export function buildStoryTemplate(
  config: StoryConfig,
  characters: TemplateCharacterContent[]
): StoryTemplateFile {
  return {
    format: "huashu-story-template",
    version: "2.0",
    templateMeta: config.templateMeta || {
      name: "未命名模板",
      author: "",
      version: "1.0",
      description: "",
    },
    worldSetting: config.worldSetting,
    rules: config.rules,
    openingMessage: config.openingMessage,
    ...(config.narrativeMode ? { narrativeMode: config.narrativeMode } : {}),
    ...(config.persona ? { persona: config.persona } : {}),
    characters: characters.map(({ content, avatar }) => ({
      card: toCharacterCardV2(content),
      ...(avatar ? { avatar } : {}),
    })),
  };
}
