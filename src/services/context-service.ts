import type { ChatNode } from "@/types";
import { attachmentService } from "./attachment-service";
import { countMessagesTokens } from "./token-service";
import { inChainOrder, keepNewestWithinBudget, partitionChain } from "./context-window";

const MAX_DOCUMENT_CONTEXT_CHARS = 12000;

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export interface ContextMessage {
  role: "system" | "user" | "assistant";
  content: string | ContentPart[];
}

type AttachmentLike = NonNullable<ChatNode["attachments"]>[number];

async function resolveAttachmentData(
  projectId: string | undefined,
  attachment: AttachmentLike
): Promise<string | undefined> {
  if (attachment.data) return attachment.data;
  if (!projectId) return undefined;

  try {
    return await attachmentService.readAttachmentData(projectId, attachment);
  } catch (err) {
    console.warn(`Failed to load attachment data: ${attachment.id}`, err);
    return undefined;
  }
}

function formatDocumentText(attachment: AttachmentLike & { data?: string }): string {
  const text = attachment.data || "(attachment failed to load)";
  if (text.length <= MAX_DOCUMENT_CONTEXT_CHARS) {
    return `[附件: ${attachment.filename}]\n${text}`;
  }

  return [
    `[附件: ${attachment.filename}]`,
    text.slice(0, MAX_DOCUMENT_CONTEXT_CHARS),
    "",
    `[内容过长，已截断，总长度约 ${text.length} 字符]`,
  ].join("\n");
}

async function nodeToMessage(
  node: ChatNode,
  projectId?: string
): Promise<ContextMessage> {
  const attachments = node.attachments || [];
  if (attachments.length === 0) {
    return { role: node.role, content: node.content };
  }

  const resolvedAttachments = await Promise.all(
    attachments.map(async (attachment) => ({
      ...attachment,
      data: await resolveAttachmentData(projectId, attachment),
    }))
  );

  const images = resolvedAttachments.filter((attachment) => attachment.type === "image");
  const documents = resolvedAttachments.filter(
    (attachment) => attachment.type === "document"
  );
  const documentText = documents.map(formatDocumentText).join("\n\n");
  const textContent = [node.content, documentText].filter(Boolean).join("\n\n");

  if (images.length > 0) {
    const parts: ContentPart[] = [];

    if (textContent) {
      parts.push({ type: "text", text: textContent });
    }

    for (const image of images) {
      if (image.data) {
        parts.push({ type: "image_url", image_url: { url: image.data } });
      }
    }

    return {
      role: node.role,
      content: parts.length > 0 ? parts : node.content,
    };
  }

  return {
    role: node.role,
    content: textContent || node.content,
  };
}

interface BuildContextOptions {
  nodes: Record<string, ChatNode>;
  currentNodeId: string;
  projectId?: string;
  projectDescription?: string;
  maxTokens: number;
  recentRounds?: number;
  storyConfig?: import("@/types").StoryConfig;
}

interface ContextResult {
  messages: ContextMessage[];
  totalTokens: number;
  truncated: boolean;
}

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

function countSingleMessageTokens(message: ContextMessage): number {
  return countMessagesTokens([message]) - 2;
}

export async function buildContext(
  options: BuildContextOptions
): Promise<ContextResult> {
  const {
    nodes,
    currentNodeId,
    projectId,
    projectDescription,
    maxTokens,
    recentRounds = 3,
    storyConfig,
  } = options;

  const messages: ContextMessage[] = [];
  let truncated = false;

  if (storyConfig) {
    const { buildStorySystemPrompt } = await import("./story-service");
    const storyPrompt = buildStorySystemPrompt(storyConfig);
    if (storyPrompt) {
      messages.push({ role: "system", content: storyPrompt });
    }
  } else {
    const systemParts: string[] = [];
    if (projectDescription) systemParts.push(projectDescription);
    if (systemParts.length > 0) {
      messages.push({ role: "system", content: systemParts.join("\n\n") });
    }
  }

  const chain = traceMessageChain(nodes, currentNodeId);
  if (chain.length === 0) {
    return {
      messages,
      totalTokens: countMessagesTokens(messages),
      truncated: false,
    };
  }

  const { fixed, candidates } = partitionChain(chain, recentRounds);

  const systemTokens =
    messages.length > 0 ? countMessagesTokens(messages) : 0;
  const fixedMessages = await Promise.all(
    fixed.map((node) => nodeToMessage(node, projectId))
  );
  const fixedTokens = systemTokens + countMessagesTokens(fixedMessages);

  const candidateMessages = await Promise.all(
    candidates.map((node) => nodeToMessage(node, projectId))
  );
  const keptIndexes = keepNewestWithinBudget(
    candidateMessages.map((message) => countSingleMessageTokens(message)),
    maxTokens - fixedTokens
  );
  truncated = keptIndexes.size < candidates.length;

  const messageById = new Map<string, ContextMessage>();
  fixed.forEach((node, index) => messageById.set(node.id, fixedMessages[index]));
  candidates.forEach((node, index) => {
    if (keptIndexes.has(index)) messageById.set(node.id, candidateMessages[index]);
  });

  for (const node of inChainOrder(chain, new Set(messageById.keys()))) {
    messages.push(messageById.get(node.id)!);
  }

  return {
    messages,
    totalTokens: countMessagesTokens(messages),
    truncated,
  };
}
