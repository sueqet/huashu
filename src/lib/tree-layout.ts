import type { ChatNode } from "@/types";
import type { Node as FlowNode, Edge } from "@xyflow/react";

const NODE_WIDTH = 240;
const NODE_HEIGHT = 80;
const HORIZONTAL_GAP = 40;
const VERTICAL_GAP = 60;

interface LayoutNode {
  id: string;
  children: LayoutNode[];
  width: number;
  x: number;
  y: number;
}

/**
 * 计算子树的总宽度
 */
function computeSubtreeWidth(node: LayoutNode): number {
  if (node.children.length === 0) {
    node.width = NODE_WIDTH;
    return NODE_WIDTH;
  }

  let totalWidth = 0;
  for (const child of node.children) {
    totalWidth += computeSubtreeWidth(child);
  }
  // 子节点之间的间距
  totalWidth += (node.children.length - 1) * HORIZONTAL_GAP;

  node.width = Math.max(NODE_WIDTH, totalWidth);
  return node.width;
}

/**
 * 分配 x 坐标
 */
function assignPositions(node: LayoutNode, x: number, y: number): void {
  node.x = x;
  node.y = y;

  if (node.children.length === 0) return;

  // 子节点占用的总宽度
  let totalChildWidth = 0;
  for (const child of node.children) {
    totalChildWidth += child.width;
  }
  totalChildWidth += (node.children.length - 1) * HORIZONTAL_GAP;

  // 子节点起始 x（让子节点组居中对齐到父节点下方）
  let childX = x + NODE_WIDTH / 2 - totalChildWidth / 2;

  for (const child of node.children) {
    // 子节点自身居中于其子树宽度
    const childCenterX = childX + child.width / 2 - NODE_WIDTH / 2;
    assignPositions(child, childCenterX, y + NODE_HEIGHT + VERTICAL_GAP);
    childX += child.width + HORIZONTAL_GAP;
  }
}

/**
 * 收集布局树中所有节点的实际 x 坐标范围
 */
function collectBounds(node: LayoutNode): { minX: number; maxX: number } {
  let minX = node.x;
  let maxX = node.x + NODE_WIDTH;

  for (const child of node.children) {
    const childBounds = collectBounds(child);
    minX = Math.min(minX, childBounds.minX);
    maxX = Math.max(maxX, childBounds.maxX);
  }

  return { minX, maxX };
}

/**
 * 将整棵布局树的所有节点平移指定偏移量
 */
function shiftTree(node: LayoutNode, dx: number): void {
  node.x += dx;
  for (const child of node.children) {
    shiftTree(child, dx);
  }
}

/**
 * 构建布局树结构
 */
function buildLayoutTree(
  nodeId: string,
  nodes: Record<string, ChatNode>,
  collapsedIds: Set<string>
): LayoutNode {
  const chatNode = nodes[nodeId];
  const children: LayoutNode[] = [];

  if (chatNode && !collapsedIds.has(nodeId)) {
    for (const childId of chatNode.childrenIds) {
      children.push(buildLayoutTree(childId, nodes, collapsedIds));
    }
  }

  return { id: nodeId, children, width: NODE_WIDTH, x: 0, y: 0 };
}

export interface ChatNodeData {
  chatNode: ChatNode;
  projectId: string;
  isCollapsed: boolean;
  hasChildren: boolean;
  batchIndex?: number | null;
  [key: string]: unknown;
}

/**
 * 将对话树节点转换为 React Flow 节点和边
 */
export function computeTreeLayout(
  nodes: Record<string, ChatNode>,
  rootNodeIds: string[],
  collapsedIds: Set<string>,
  projectId: string
): { flowNodes: FlowNode<ChatNodeData>[]; flowEdges: Edge[] } {
  const flowNodes: FlowNode<ChatNodeData>[] = [];
  const flowEdges: Edge[] = [];

  let offsetX = 0;

  for (const rootId of rootNodeIds) {
    if (!nodes[rootId]) continue;

    // 构建布局树
    const layoutTree = buildLayoutTree(rootId, nodes, collapsedIds);

    // 计算宽度
    computeSubtreeWidth(layoutTree);

    // 分配位置
    assignPositions(layoutTree, offsetX, 0);

    // 收集实际边界并平移，确保不与前一棵树重叠
    const bounds = collectBounds(layoutTree);
    if (bounds.minX < offsetX) {
      shiftTree(layoutTree, offsetX - bounds.minX);
    }
    offsetX = (bounds.minX < offsetX ? offsetX + (bounds.maxX - bounds.minX) : bounds.maxX) + HORIZONTAL_GAP * 2;

    // 展平布局树，生成 Flow 节点和边
    const queue: LayoutNode[] = [layoutTree];
    while (queue.length > 0) {
      const layoutNode = queue.shift()!;
      const chatNode = nodes[layoutNode.id];
      if (!chatNode) continue;

      flowNodes.push({
        id: layoutNode.id,
        type: "chatNode",
        position: { x: layoutNode.x, y: layoutNode.y },
        data: {
          chatNode,
          projectId,
          isCollapsed: collapsedIds.has(layoutNode.id),
          hasChildren: chatNode.childrenIds.length > 0,
        },
      });

      // 添加边（父→子）
      if (!collapsedIds.has(layoutNode.id)) {
        for (const child of layoutNode.children) {
          flowEdges.push({
            id: `${layoutNode.id}-${child.id}`,
            source: layoutNode.id,
            target: child.id,
            type: "smoothstep",
          });
          queue.push(child);
        }
      }
    }

  }

  return { flowNodes, flowEdges };
}
