/**
 * 故事模式服务：选项解析、System Prompt 拼装、章节管理
 */
import type { CharacterCard, StoryConfig, StoryTemplateFile, ChatNode } from "@/types";
import { buildStoryTemplate, parseStoryTemplate } from "@/lib/story-template";
import { detectImageExtension } from "@/lib/image-type";
import { dataUrlToBytes } from "./attachment-data";
import { characterService } from "./character-service";
import type { ContextMessage } from "./context-service";
import { streamChatCompletion } from "./ai-service";

export {
  buildStorySystemPrompt,
  buildPostHistoryInstruction,
  getStoryOpening,
} from "@/lib/story-prompt";

/** 解析后的选项 */
export interface ParsedChoice {
  index: number;
  text: string;
}

/* ========== 1. 选项解析 ========== */

/**
 * 从 AI 回复中解析 [选项N] xxx 格式
 * 支持变体：[选项1] [选项2] [选项3] … [选项9]+
 */
export function parseChoices(content: string): ParsedChoice[] {
  const choices: ParsedChoice[] = [];
  const regex = /\[选项(\d+)\]\s*(.+)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    choices.push({
      index: parseInt(match[1], 10),
      text: match[2].trim(),
    });
  }
  return choices;
}

/**
 * 移除文本中的 [选项N] xxx 标记
 */
export function removeChoiceMarkers(content: string): string {
  return content.replace(/\[选项\d+\]\s*.+/g, "").replace(/\n{3,}/g, "\n\n").trim();
}

/* ========== 5. 章节摘要生成 ========== */

/**
 * 通过独立 AI 调用生成本章摘要
 */
export async function generateChapterSummary(
  conversationContent: string,
  apiUrl: string,
  apiKey: string,
  model: string
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const messages: ContextMessage[] = [
      {
        role: "system",
        content:
          "你是一个故事摘要助手。请根据提供的对话内容，生成一段简洁的章节摘要（200字以内），涵盖关键情节、角色行动和重要事件。不要添加任何原文中没有的内容。",
      },
      {
        role: "user",
        content: `请为以下章节内容生成摘要：\n\n${conversationContent}`,
      },
    ];

    streamChatCompletion({
      apiUrl,
      apiKey,
      model,
      messages,
      modelConfig: {
        temperature: 0.3,
        maxTokens: 1000,
        topP: 1,
        frequencyPenalty: 0,
        presencePenalty: 0,
      },
      signal: new AbortController().signal,
      callbacks: {
        onToken: () => {},
        onDone: (content) => {
          resolve(content.trim());
        },
        onError: (err) => {
          reject(err);
        },
      },
    });
  });
}

/* ========== 6. 章节过渡生成 ========== */

/**
 * 生成新章节的过渡旁白
 */
export async function generateChapterTransition(
  summary: string,
  recentMessages: string,
  apiUrl: string,
  apiKey: string,
  model: string
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const messages: ContextMessage[] = [
      {
        role: "system",
        content:
          "你是一位互动小说的叙事者。请根据前章摘要和最近的对话，撰写一段自然流畅的过渡旁白，衔接前章剧情并开启新篇章。保持叙事风格一致，适当营造悬念。字数控制在150字以内。",
      },
      {
        role: "user",
        content: `前章摘要：${summary}\n\n最近对话：\n${recentMessages}\n\n请生成下一章的开场过渡旁白。`,
      },
    ];

    streamChatCompletion({
      apiUrl,
      apiKey,
      model,
      messages,
      modelConfig: {
        temperature: 0.5,
        maxTokens: 800,
        topP: 1,
        frequencyPenalty: 0,
        presencePenalty: 0,
      },
      signal: new AbortController().signal,
      callbacks: {
        onToken: () => {},
        onDone: (content) => {
          resolve(content.trim());
        },
        onError: (err) => {
          reject(err);
        },
      },
    });
  });
}

/* ========== 7. 模板导入导出 ========== */

/**
 * 导出故事配置为模板文件（内嵌出场角色的完整角色卡和头像）
 */
export async function exportStoryTemplate(storyConfig: StoryConfig): Promise<StoryTemplateFile> {
  const cards = await characterService.getMany(storyConfig.characterIds);
  const characters = await Promise.all(
    cards.map(async (card) => {
      const { schemaVersion: _v, id: _id, avatar: _a, createdAt: _c, updatedAt: _u, ...content } = card;
      const avatar = await characterService.readAvatarDataUrl(card);
      return { content, ...(avatar ? { avatar } : {}) };
    })
  );
  return buildStoryTemplate(storyConfig, characters);
}

/**
 * 导入模板文件：模板中的角色写入角色库，返回引用这些角色的故事配置
 */
export async function importStoryTemplate(
  data: unknown
): Promise<{ storyConfig: StoryConfig; errors: string[] }> {
  const parsed = parseStoryTemplate(data);
  if (parsed.errors.length > 0) {
    return { storyConfig: createDefaultStoryConfig(), errors: parsed.errors };
  }

  const cards: CharacterCard[] = [];
  for (const { content, avatar } of parsed.characters) {
    const bytes = avatar ? dataUrlToBytes(avatar) : null;
    const ext = bytes ? detectImageExtension(bytes) : null;
    cards.push(await characterService.create(content, bytes && ext ? { bytes, ext } : undefined));
  }

  return {
    storyConfig: {
      ...parsed.config,
      characterIds: cards.map((card) => card.id),
      chapterSummaries: [],
    },
    errors: [],
  };
}

/* ========== 8. 默认配置 ========== */

/**
 * 返回空的默认 StoryConfig
 */
export function createDefaultStoryConfig(): StoryConfig {
  return {
    worldSetting: "",
    rules: "",
    characterIds: [],
    narrativeMode: "narrator",
    openingMessage: "",
    chapterSummaries: [],
  };
}

/* ========== 9. 对话链文本提取 ========== */

/**
 * 从叶节点向上追溯，获取完整对话链文本
 */
export function getConversationText(
  nodes: Record<string, ChatNode>,
  leafNodeId: string
): string {
  const chain: ChatNode[] = [];
  let currentId: string | null = leafNodeId;

  while (currentId) {
    const node: ChatNode | undefined = nodes[currentId];
    if (!node) break;
    chain.unshift(node);
    currentId = node.parentId;
  }

  return chain
    .map((n) => `${n.role === "user" ? "玩家" : "AI"}: ${n.content}`)
    .join("\n");
}

/**
 * 获取最后 N 轮对话文本
 * 一轮 = 一条 user + 一条 assistant
 */
export function getRecentMessagesText(
  nodes: Record<string, ChatNode>,
  leafNodeId: string,
  rounds: number = 3
): string {
  // 先收集完整链
  const chain: ChatNode[] = [];
  let currentId: string | null = leafNodeId;

  while (currentId) {
    const node: ChatNode | undefined = nodes[currentId];
    if (!node) break;
    chain.unshift(node);
    currentId = node.parentId;
  }

  // 取最后 rounds * 2 条消息（每轮2条）
  const recentNodes = chain.slice(-(rounds * 2));

  return recentNodes
    .map((n) => `${n.role === "user" ? "玩家" : "AI"}: ${n.content}`)
    .join("\n");
}
