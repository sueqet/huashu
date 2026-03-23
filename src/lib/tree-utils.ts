import type { ChatNode } from "@/types";

/**
 * 检测 ancestorId 是否是 descendantId 的祖先节点
 * 用于防止拖拽连接时形成循环
 */
export function isAncestor(
  nodes: Record<string, ChatNode>,
  ancestorId: string,
  descendantId: string
): boolean {
  let currentId: string | null = descendantId;
  while (currentId) {
    if (currentId === ancestorId) return true;
    const current: ChatNode | undefined = nodes[currentId];
    if (!current) break;
    currentId = current.parentId;
  }
  return false;
}

/**
 * 收集节点的所有后代节点 ID（不包含节点本身）
 */
export function collectDescendantIds(
  nodes: Record<string, ChatNode>,
  nodeId: string
): string[] {
  const result: string[] = [];
  const stack = [...(nodes[nodeId]?.childrenIds ?? [])];
  while (stack.length > 0) {
    const id = stack.pop()!;
    result.push(id);
    const node = nodes[id];
    if (node) {
      stack.push(...node.childrenIds);
    }
  }
  return result;
}
