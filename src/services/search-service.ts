import type { ChatNode, Conversation } from "@/types";
import { fileService } from "./file-service";

export interface SearchResult {
  /** 节点 ID */
  nodeId: string;
  /** 所属对话 ID */
  conversationId: string;
  /** 所属对话名称 */
  conversationName: string;
  /** 节点角色 */
  role: ChatNode["role"];
  /** 内容摘要（带高亮标记位置） */
  content: string;
  /** 匹配关键词在内容中的起始位置 */
  matchIndex: number;
  /** 节点创建时间 */
  createdAt: number;
}

/**
 * 在项目内所有对话中搜索节点内容
 */
export async function searchNodes(
  projectId: string,
  query: string
): Promise<SearchResult[]> {
  if (!query.trim()) return [];

  const lowerQuery = query.toLowerCase();
  const results: SearchResult[] = [];
  const dir = `projects/${projectId}/conversations`;
  const entries = await fileService.listDir(dir);

  for (const entry of entries) {
    if (!entry.isFile || !entry.name?.endsWith(".json")) continue;

    try {
      const conv = await fileService.readJSON<Conversation>(
        `${dir}/${entry.name}`
      );

      for (const node of Object.values(conv.nodes)) {
        const lowerContent = node.content.toLowerCase();
        const matchIndex = lowerContent.indexOf(lowerQuery);
        if (matchIndex === -1) continue;

        // 提取匹配位置附近的摘要（前后各 50 字符）
        const start = Math.max(0, matchIndex - 50);
        const end = Math.min(node.content.length, matchIndex + query.length + 50);
        let snippet = node.content.slice(start, end);
        if (start > 0) snippet = "..." + snippet;
        if (end < node.content.length) snippet = snippet + "...";

        results.push({
          nodeId: node.id,
          conversationId: conv.id,
          conversationName: conv.name,
          role: node.role,
          content: snippet,
          matchIndex: matchIndex - start + (start > 0 ? 3 : 0),
          createdAt: node.createdAt,
        });
      }
    } catch {
      // 跳过无法读取的对话
    }
  }

  // 按相关性排序（匹配位置越靠前越优先，然后按时间倒序）
  results.sort((a, b) => {
    if (a.matchIndex !== b.matchIndex) return a.matchIndex - b.matchIndex;
    return b.createdAt - a.createdAt;
  });

  return results;
}
