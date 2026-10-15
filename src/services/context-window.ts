/**
 * 分层滑动窗口的纯逻辑部分（不依赖 Tauri，便于测试）
 *
 * 链被划分为三段：首轮（前 2 条）、中段、最近 N 轮。
 * 首轮、最近 N 轮、中段里的锁定节点始终保留；
 * 中段未锁定节点从最新往最旧，在预算内尽量保留。
 */

interface WindowNode {
  id: string;
  isPinned: boolean;
}

export interface ChainPartition<T> {
  /** 始终保留的节点（首轮 + 中段锁定 + 最近 N 轮），按链顺序 */
  fixed: T[];
  /** 可被裁剪的中段未锁定节点，按链顺序 */
  candidates: T[];
}

export function partitionChain<T extends WindowNode>(
  chain: T[],
  recentRounds: number
): ChainPartition<T> {
  const lastRoundStart = Math.max(2, chain.length - recentRounds * 2);
  const fixed: T[] = [];
  const candidates: T[] = [];

  chain.forEach((node, index) => {
    const isMiddle = index >= 2 && index < lastRoundStart;
    if (isMiddle && !node.isPinned) {
      candidates.push(node);
    } else {
      fixed.push(node);
    }
  });

  return { fixed, candidates };
}

/**
 * 从最新到最旧贪心保留，返回被保留的下标集合。
 * 放不下的条目会被跳过，继续尝试更旧、更短的条目。
 */
export function keepNewestWithinBudget(costs: number[], budget: number): Set<number> {
  const kept = new Set<number>();
  let remaining = budget;

  for (let i = costs.length - 1; i >= 0; i--) {
    if (remaining >= costs[i]) {
      kept.add(i);
      remaining -= costs[i];
    }
  }

  return kept;
}

/** 按原始链顺序返回被保留的节点 */
export function inChainOrder<T extends WindowNode>(chain: T[], keptIds: Set<string>): T[] {
  return chain.filter((node) => keptIds.has(node.id));
}
