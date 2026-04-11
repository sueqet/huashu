import type { ChatNode } from "@/types";
import { countTokens, countMessagesTokens } from "./token-service";

/** OpenAI Vision 格式的内容部分 */
export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export interface ContextMessage {
  role: "system" | "user" | "assistant";
  content: string | ContentPart[];
}

/** 将 ChatNode 转为 ContextMessage，处理附件 */
function nodeToMessage(node: ChatNode): ContextMessage {
  const attachments = node.attachments || [];
  const images = attachments.filter((a) => a.type === "image");
  const docs = attachments.filter((a) => a.type === "document");

  // 如果没有附件，返回纯文本
  if (images.length === 0 && docs.length === 0) {
    return { role: node.role, content: node.content };
  }

  // 有图片附件：使用 content 数组格式
  if (images.length > 0) {
    const parts: ContentPart[] = [];
    // 文本内容（包含文档附件的文本）
    let textContent = node.content;
    if (docs.length > 0) {
      const docTexts = docs
        .map((d) => `[附件: ${d.filename}]\n${d.data}`)
        .join("\n\n");
      textContent = textContent + "\n\n" + docTexts;
    }
    if (textContent) {
      parts.push({ type: "text", text: textContent });
    }
    // 图片
    for (const img of images) {
      parts.push({ type: "image_url", image_url: { url: img.data } });
    }
    return { role: node.role, content: parts };
  }

  // 只有文档附件：拼接到文本中
  const docTexts = docs
    .map((d) => `[附件: ${d.filename}]\n${d.data}`)
    .join("\n\n");
  return { role: node.role, content: node.content + "\n\n" + docTexts };
}

interface BuildContextOptions {
  /** 节点字典 */
  nodes: Record<string, ChatNode>;
  /** 当前节点 ID */
  currentNodeId: string;
  /** 项目描述（作为 system 消息前缀） */
  projectDescription?: string;
  /** RAG 检索结果 */
  ragContext?: string;
  /** 最大 Token 数 */
  maxTokens: number;
  /** 模型名称（用于 Token 计算） */
  model: string;
  /** 最近保留的轮数（不被裁剪） */
  recentRounds?: number;
  /** 故事配置（故事模式时提供） */
  storyConfig?: import("@/types").StoryConfig;
  /** 故事 RAG 上下文（历史章节检索结果） */
  storyRagContext?: string;
}

interface ContextResult {
  messages: ContextMessage[];
  totalTokens: number;
  truncated: boolean;
}

/**
 * 从节点向上追溯，收集完整消息链
 */
function traceMessageChain(
  nodes: Record<string, ChatNode>,
  nodeId: string
): ChatNode[] {
  const chain: ChatNode[] = [];
  let currentId: string | null = nodeId;
  while (currentId) {
    const node: ChatNode | undefined = nodes[currentId];
    if (!node) break;
    chain.unshift(node);
    currentId = node.parentId;
  }
  return chain;
}

/**
 * 构建 AI 调用的上下文消息
 *
 * 分层滑动窗口策略：
 * 1. 系统消息（项目描述 + RAG）始终保留
 * 2. 锁定节点 (isPinned) 始终保留
 * 3. 最近 N 轮对话始终保留
 * 4. 首轮对话尽量保留
 * 5. 中间对话按从旧到新裁剪
 */
export async function buildContext(options: BuildContextOptions): Promise<ContextResult> {
  const {
    nodes,
    currentNodeId,
    projectDescription,
    ragContext,
    maxTokens,
    model,
    recentRounds = 3,
    storyConfig,
    storyRagContext,
  } = options;

  const messages: ContextMessage[] = [];
  let truncated = false;

  // 1. 构建 system 消息
  if (storyConfig) {
    // 故事模式：使用 story-service 拼装 system prompt
    const { buildStorySystemPrompt } = await import("./story-service");
    const storyPrompt = buildStorySystemPrompt(storyConfig, storyRagContext);
    if (storyPrompt) {
      messages.push({ role: "system", content: storyPrompt });
    }
  } else {
    // 对话模式：原有逻辑
    const systemParts: string[] = [];
    if (projectDescription) {
      systemParts.push(projectDescription);
    }
    if (ragContext) {
      systemParts.push("以下是相关的参考资料：\n" + ragContext);
    }
    if (systemParts.length > 0) {
      messages.push({
        role: "system",
        content: systemParts.join("\n\n"),
      });
    }
  }

  // 2. 追溯消息链
  const chain = traceMessageChain(nodes, currentNodeId);
  if (chain.length === 0) {
    return { messages, totalTokens: countMessagesTokens(messages, model), truncated: false };
  }

  // 3. 分类消息
  const firstRound = chain.slice(0, 2); // 首轮（最多2条）
  const lastRoundStart = Math.max(2, chain.length - recentRounds * 2);
  const recentMessages = chain.slice(lastRoundStart);
  const middleMessages = chain.slice(2, lastRoundStart);

  // 4. 计算固定部分的 Token
  const systemTokens = messages.length > 0
    ? countMessagesTokens(messages, model)
    : 0;

  // 固定保留的消息：首轮 + 最近轮 + 锁定的中间消息
  const pinnedMiddle = middleMessages.filter((n) => n.isPinned);
  const unpinnedMiddle = middleMessages.filter((n) => !n.isPinned);

  const fixedNodes = [...firstRound, ...pinnedMiddle, ...recentMessages];
  const fixedMessages = fixedNodes.map((n) => nodeToMessage(n));
  const fixedTokens = systemTokens + countMessagesTokens(fixedMessages, model);

  // 5. 从剩余空间中尽量多保留中间消息（从新到旧加入）
  let remainingTokens = maxTokens - fixedTokens;
  const keptMiddle: ChatNode[] = [];

  for (let i = unpinnedMiddle.length - 1; i >= 0; i--) {
    const node = unpinnedMiddle[i];
    const nodeTokens = countTokens(node.content, model) + 4;
    if (remainingTokens >= nodeTokens) {
      keptMiddle.unshift(node);
      remainingTokens -= nodeTokens;
    } else {
      truncated = true;
    }
  }

  // 6. 按原始顺序组装最终消息
  const allNodes = [
    ...firstRound,
    ...keptMiddle,
    ...pinnedMiddle,
    ...recentMessages,
  ];

  // 去重（锁定消息可能在首轮或最近轮中）
  const seen = new Set<string>();
  for (const node of allNodes) {
    if (seen.has(node.id)) continue;
    seen.add(node.id);
    messages.push(nodeToMessage(node));
  }

  const totalTokens = countMessagesTokens(messages, model);

  return { messages, totalTokens, truncated };
}
