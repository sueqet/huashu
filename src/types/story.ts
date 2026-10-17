import type { Persona } from "./character";

/** 旧版内联角色（仅用于迁移和导入 1.0 剧本模板） */
export interface LegacyStoryCharacter {
  name: string;
  description: string;
  isOriginal?: boolean;
}

/**
 * 叙事模式
 * - narrator：AI 作为叙事者推进故事，并给出选项
 * - roleplay：AI 扮演第一个出场角色与玩家对话
 */
export type NarrativeMode = "narrator" | "roleplay";

/** 章节摘要 */
export interface ChapterSummary {
  /** 对应的对话 ID */
  conversationId: string;
  /** 章节序号 */
  chapterNumber: number;
  /** AI 生成的摘要内容 */
  summary: string;
  /** 创建时间 */
  createdAt: number;
}

/** 剧本模板元信息 */
export interface TemplateMeta {
  /** 模板名称 */
  name: string;
  /** 作者 */
  author: string;
  /** 版本号 */
  version: string;
  /** 模板简介 */
  description: string;
}

/** 故事配置（仅 mode='story' 时存在） */
export interface StoryConfig {
  /** 世界观设定（模板固定） */
  worldSetting: string;
  /** 故事规则/玩法说明（模板固定） */
  rules: string;
  /** 出场角色（引用角色库中的角色卡 ID，顺序即优先级） */
  characterIds: string[];
  /** 玩家人设，替换角色卡中的 {{user}} */
  persona?: Persona;
  /** 叙事模式，默认 narrator */
  narrativeMode?: NarrativeMode;
  /** 开场白（第一条 AI 消息）；角色扮演模式下为空时使用主角色的开场白 */
  openingMessage: string;
  /** 模板来源信息（从模板导入时存在） */
  templateMeta?: TemplateMeta;
  /** 章节摘要（系统自动生成） */
  chapterSummaries: ChapterSummary[];
  /** @deprecated 旧版内联角色，加载时迁移为角色卡 */
  characters?: LegacyStoryCharacter[];
}

/** 剧本模板中的角色：SillyTavern V2 角色卡对象，头像为可选的 data URL */
export interface TemplateCharacter {
  card: Record<string, unknown>;
  avatar?: string;
}

/** 剧本模板导出格式（2.0 起内嵌完整角色卡；仍可导入 1.0 的内联角色） */
export interface StoryTemplateFile {
  format: "huashu-story-template";
  version: "2.0";
  templateMeta: TemplateMeta;
  worldSetting: string;
  rules: string;
  openingMessage: string;
  narrativeMode?: NarrativeMode;
  persona?: Persona;
  characters: TemplateCharacter[];
}
