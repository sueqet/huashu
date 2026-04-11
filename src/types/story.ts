/** 故事角色 */
export interface StoryCharacter {
  /** 角色名称 */
  name: string;
  /** 角色描述 */
  description: string;
  /** 是否为模板原始角色（true = 模板自带, false = 玩家新增） */
  isOriginal: boolean;
}

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
  /** 角色列表（初始固定 + 可新增） */
  characters: StoryCharacter[];
  /** 开场白（第一条 AI 消息） */
  openingMessage: string;
  /** 模板来源信息（从模板导入时存在） */
  templateMeta?: TemplateMeta;
  /** 章节摘要（系统自动生成） */
  chapterSummaries: ChapterSummary[];
}

/** 剧本模板导出格式 */
export interface StoryTemplateFile {
  format: "huashu-story-template";
  version: "1.0";
  templateMeta: TemplateMeta;
  worldSetting: string;
  rules: string;
  characters: Omit<StoryCharacter, "isOriginal">[];
  openingMessage: string;
}

/** Agent 模式预留类型 */
export interface AgentConfig {
  tools: AgentTool[];
  systemPrompt: string;
  maxIterations: number;
}

export interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}
