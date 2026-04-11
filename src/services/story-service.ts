/**
 * 故事模式服务：选项解析、System Prompt 拼装、章节管理
 */
import { readFile, writeFile, BaseDirectory } from "@tauri-apps/plugin-fs";
import type {
  StoryConfig,
  StoryCharacter,
  ChapterSummary,
  StoryTemplateFile,
  ChatNode,
} from "@/types";
import type { ContextMessage } from "./context-service";
import { streamChatCompletion } from "./ai-service";
import { getEmbedding } from "./embedding-service";
import { searchKnowledge } from "./rag-service";
import { VectorStore } from "./vector-store";
import { fileService } from "./file-service";

const BASE_DIR = BaseDirectory.AppData;

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

/* ========== 2. System Prompt 拼装 ========== */

/**
 * 构建故事模式 System Prompt
 *
 * 组装顺序：世界观 → 规则 → 角色 → 前情提要 → RAG → 选项指令
 */
export function buildStorySystemPrompt(
  storyConfig: StoryConfig,
  ragContext?: string
): string {
  const sections: string[] = [];

  // 世界观设定
  if (storyConfig.worldSetting.trim()) {
    sections.push(`[世界观设定]\n${storyConfig.worldSetting.trim()}`);
  }

  // 故事规则
  if (storyConfig.rules.trim()) {
    sections.push(`[故事规则]\n${storyConfig.rules.trim()}`);
  }

  // 角色列表
  if (storyConfig.characters.length > 0) {
    const charList = storyConfig.characters
      .map((c) => `- ${c.name}: ${c.description}`)
      .join("\n");
    sections.push(`[角色列表]\n${charList}`);
  }

  // 前情提要
  const summaries = storyConfig.chapterSummaries;
  if (summaries.length > 0) {
    let displayedSummaries: ChapterSummary[];
    if (summaries.length <= 5) {
      displayedSummaries = summaries;
    } else {
      // 超过5章，只保留最后2章
      displayedSummaries = summaries.slice(-2);
    }
    const summaryText = displayedSummaries
      .map((s) => `第${s.chapterNumber}章: ${s.summary}`)
      .join("\n");
    sections.push(`[前情提要]\n${summaryText}`);
  }

  // 相关历史片段（RAG）
  if (ragContext && ragContext.trim()) {
    sections.push(`[相关历史片段]\n${ragContext.trim()}`);
  }

  // 选项指令
  sections.push(
    `[指令]\n你是一位互动小说的叙事者。请根据玩家的选择推进故事，撰写引人入胜的情节。每次回复末尾，请提供2-4个选项供玩家选择，格式为：\n[选项1] 选项内容\n[选项2] 选项内容\n[选项3] 选项内容`
  );

  return sections.join("\n\n");
}

/* ========== 3. RAG 检索 ========== */

/**
 * 搜索知识库获取相关历史上下文
 */
export async function getStoryRagContext(
  projectId: string,
  query: string,
  apiUrl: string,
  apiKey: string,
  embeddingModel: string
): Promise<string> {
  try {
    const results = await searchKnowledge(
      projectId,
      query,
      apiUrl,
      apiKey,
      embeddingModel,
      5
    );
    if (results.length === 0) return "";

    return results
      .map((r) => r.chunk.content)
      .join("\n---\n");
  } catch {
    return "";
  }
}

/* ========== 4. 章节摘要索引 ========== */

/**
 * 将早期章节摘要（除最后2章外）索引到 RAG 知识库
 *
 * 流程：
 * 1. 读取现有 chunks
 * 2. 删除旧的 story_summary_ chunks
 * 3. 为早期摘要生成新 chunks 和 embedding
 * 4. 更新向量存储
 */
export async function indexChapterSummaries(
  projectId: string,
  summaries: ChapterSummary[],
  apiUrl: string,
  apiKey: string,
  embeddingModel: string
): Promise<void> {
  if (summaries.length <= 2) return; // 没有需要索引的早期章节

  // 早期章节 = 除最后2章外的所有
  const earlySummaries = summaries.slice(0, -2);

  const kbDir = `projects/${projectId}/knowledge_base`;
  const chunksFilePath = `${kbDir}/chunks.json`;
  const vectorsFilePath = `${kbDir}/vectors.bin`;

  // 1. 读取现有 chunks
  let allChunks: Array<{
    id: string;
    documentId: string;
    content: string;
    chunkIndex: number;
    metadata?: Record<string, unknown>;
  }> = [];
  try {
    allChunks = await fileService.readJSON(chunksFilePath);
  } catch {
    // 空知识库
  }

  // 2. 删除旧的 story_summary_ chunks
  const STORY_SUMMARY_PREFIX = "story_summary_";
  allChunks = allChunks.filter((c) => !c.id.startsWith(STORY_SUMMARY_PREFIX));

  // 3. 添加新的摘要 chunks
  const newChunks = earlySummaries.map((s) => ({
    id: `story_summary_ch${s.chapterNumber}`,
    documentId: "__story_summary__",
    content: `第${s.chapterNumber}章摘要: ${s.summary}`,
    chunkIndex: s.chapterNumber - 1,
    metadata: { type: "story_summary", chapterNumber: s.chapterNumber },
  }));
  allChunks.push(...newChunks);

  await fileService.writeJSON(chunksFilePath, allChunks);

  // 4. 更新向量存储
  let store: VectorStore;
  try {
    const bytes = await readFile(vectorsFilePath, { baseDir: BASE_DIR });
    store = VectorStore.deserialize(bytes);
  } catch {
    store = new VectorStore();
  }

  // 删除旧的摘要向量
  store.removeByPrefix(STORY_SUMMARY_PREFIX);

  // 为新 chunks 生成 embedding
  for (const chunk of newChunks) {
    try {
      const result = await getEmbedding(chunk.content, apiUrl, apiKey, embeddingModel);
      store.add(chunk.id, result.embedding);
    } catch {
      // 单条 embedding 失败不中断整体流程
      console.error(`Failed to embed chunk ${chunk.id}`);
    }
  }

  const bytes = store.serialize();
  await writeFile(vectorsFilePath, new Uint8Array(bytes), { baseDir: BASE_DIR });
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
 * 导出故事配置为模板文件格式
 */
export function exportStoryTemplate(storyConfig: StoryConfig): StoryTemplateFile {
  return {
    format: "huashu-story-template",
    version: "1.0",
    templateMeta: storyConfig.templateMeta || {
      name: "未命名模板",
      author: "",
      version: "1.0",
      description: "",
    },
    worldSetting: storyConfig.worldSetting,
    rules: storyConfig.rules,
    characters: storyConfig.characters.map(({ name, description }) => ({
      name,
      description,
    })),
    openingMessage: storyConfig.openingMessage,
  };
}

/**
 * 导入模板文件，校验格式并返回 StoryConfig 和错误列表
 */
export function importStoryTemplate(
  data: unknown
): { storyConfig: StoryConfig; errors: string[] } {
  const errors: string[] = [];

  // 基本类型校验
  if (!data || typeof data !== "object") {
    return {
      storyConfig: createDefaultStoryConfig(),
      errors: ["无效的模板数据：期望对象"],
    };
  }

  const obj = data as Record<string, unknown>;

  // 格式校验
  if (obj.format !== "huashu-story-template") {
    return {
      storyConfig: createDefaultStoryConfig(),
      errors: ["无效的模板格式：format 字段必须为 'huashu-story-template'"],
    };
  }

  // 逐字段校验
  if (typeof obj.worldSetting !== "string") {
    errors.push("worldSetting 应为字符串");
  }
  if (typeof obj.rules !== "string") {
    errors.push("rules 应为字符串");
  }
  if (typeof obj.openingMessage !== "string") {
    errors.push("openingMessage 应为字符串");
  }

  // 角色校验
  let characters: StoryCharacter[] = [];
  if (Array.isArray(obj.characters)) {
    characters = obj.characters
      .map((c: unknown, i: number) => {
        if (!c || typeof c !== "object") {
          errors.push(`characters[${i}] 应为对象`);
          return null;
        }
        const char = c as Record<string, unknown>;
        if (typeof char.name !== "string") {
          errors.push(`characters[${i}].name 应为字符串`);
          return null;
        }
        if (typeof char.description !== "string") {
          errors.push(`characters[${i}].description 应为字符串`);
          return null;
        }
        return {
          name: char.name as string,
          description: char.description as string,
          isOriginal: true,
        };
      })
      .filter((c): c is StoryCharacter => c !== null);
  } else {
    errors.push("characters 应为数组");
  }

  // 模板元信息
  let templateMeta: StoryConfig["templateMeta"];
  if (obj.templateMeta && typeof obj.templateMeta === "object") {
    const meta = obj.templateMeta as Record<string, unknown>;
    templateMeta = {
      name: typeof meta.name === "string" ? meta.name : "未命名模板",
      author: typeof meta.author === "string" ? meta.author : "",
      version: typeof meta.version === "string" ? meta.version : "1.0",
      description: typeof meta.description === "string" ? meta.description : "",
    };
  }

  const storyConfig: StoryConfig = {
    worldSetting: typeof obj.worldSetting === "string" ? obj.worldSetting : "",
    rules: typeof obj.rules === "string" ? obj.rules : "",
    characters,
    openingMessage:
      typeof obj.openingMessage === "string" ? obj.openingMessage : "",
    ...(templateMeta ? { templateMeta } : {}),
    chapterSummaries: [],
  };

  return { storyConfig, errors };
}

/* ========== 8. 默认配置 ========== */

/**
 * 返回空的默认 StoryConfig
 */
export function createDefaultStoryConfig(): StoryConfig {
  return {
    worldSetting: "",
    rules: "",
    characters: [],
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
