import type { ChatNode } from "@/types";

const MAX_IMAGE_CONTEXT_CHARS = 4000;

function collectChain(nodes: Record<string, ChatNode>, nodeId: string): ChatNode[] {
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

export function buildImagePromptFromContext(
  nodes: Record<string, ChatNode>,
  selectedNodeId: string,
  inputText: string
): string {
  const prompt = inputText.trim();
  if (prompt) return prompt;

  const chain = collectChain(nodes, selectedNodeId)
    .filter((node) => node.content.trim())
    .slice(-6);

  const context = chain
    .map((node) => `${node.role === "user" ? "User" : "Assistant"}: ${node.content.trim()}`)
    .join("\n\n");

  if (!context) return "";

  return [
    "Create an image based on the following conversation context.",
    "Focus on the latest scene, characters, mood, and visual details.",
    "",
    context.slice(-MAX_IMAGE_CONTEXT_CHARS),
  ].join("\n");
}
