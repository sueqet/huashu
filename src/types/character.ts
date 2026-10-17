/** 角色卡（字段对齐 SillyTavern Character Card V2/V3） */
export interface CharacterCard {
  schemaVersion: number;
  id: string;
  name: string;
  /** 身份、外貌等基本描述（ST: description） */
  description: string;
  /** 性格（ST: personality） */
  personality: string;
  /** 场景（ST: scenario） */
  scenario: string;
  /** 开场白（ST: first_mes） */
  firstMessage: string;
  /** 备选开场白（ST: alternate_greetings） */
  alternateGreetings: string[];
  /** 示例对话，用 <START> 分隔（ST: mes_example） */
  exampleDialogue: string;
  /** 角色自带的系统提示词，角色扮演模式下替换默认指令（ST: system_prompt） */
  systemPrompt: string;
  /** 放在对话历史之后的指令（ST: post_history_instructions） */
  postHistoryInstructions: string;
  /** 作者备注，不发送给模型（ST: creator_notes） */
  creatorNotes: string;
  tags: string[];
  creator: string;
  characterVersion: string;
  /** 头像文件名，位于角色库目录下 */
  avatar?: string;
  /** 角色自带的世界书（原样保留，ST: character_book） */
  characterBook?: unknown;
  /** ST 扩展字段（原样保留，导出时带回） */
  extensions: Record<string, unknown>;
  /** 卡片中其余未识别的字段（如 V3 的 nickname、assets），导出时带回 */
  extra: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

/** 玩家人设：替换卡片中的 {{user}} */
export interface Persona {
  name: string;
  description: string;
}
