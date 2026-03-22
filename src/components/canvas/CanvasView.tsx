import { useCallback, useEffect, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  type NodeMouseHandler,
  type Node as FlowNode,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { useConversationStore } from "@/stores/conversation-store";
import { useEditStore } from "@/stores/edit-store";
import { ChatNodeComponent } from "./ChatNodeComponent";
import { ChatPanel } from "./ChatPanel";
import { SearchPanel } from "./SearchPanel";
import { EditToolbar } from "./EditToolbar";
import { computeTreeLayout } from "@/lib/tree-layout";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Plus, Search } from "lucide-react";
import { conversationService } from "@/services";

const nodeTypes = {
  chatNode: ChatNodeComponent,
};

interface CanvasViewProps {
  projectId: string;
  conversationId: string;
  onBack: () => void;
  onOpenConversation?: (conversationId: string, nodeId: string) => void;
}

/**
 * Helper component rendered inside <ReactFlow> to pan/zoom to a specific node.
 */
function FitToNode({ nodeId }: { nodeId: string | null }) {
  const { getNode, setCenter } = useReactFlow();

  useEffect(() => {
    if (!nodeId) return;
    // Small delay to ensure layout has been applied
    const timer = setTimeout(() => {
      const node = getNode(nodeId);
      if (node) {
        const x = node.position.x + (node.measured?.width ?? 240) / 2;
        const y = node.position.y + (node.measured?.height ?? 80) / 2;
        setCenter(x, y, { zoom: 1, duration: 300 });
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [nodeId, getNode, setCenter]);

  return null;
}

export function CanvasView(props: CanvasViewProps) {
  return (
    <ReactFlowProvider>
      <CanvasViewInner {...props} />
    </ReactFlowProvider>
  );
}

function CanvasViewInner({
  projectId,
  conversationId,
  onBack,
  onOpenConversation,
}: CanvasViewProps) {
  const {
    conversation,
    loadConversation,
    addNodeAndSave,
    removeNodeTreeAndSave,
    restoreConversation,
  } = useConversationStore();

  const isEditMode = useEditStore((s) => s.isEditMode);
  const isBatchMode = useEditStore((s) => s.isBatchMode);
  const batchSelectedIds = useEditStore((s) => s.batchSelectedIds);
  const takeSnapshot = useEditStore((s) => s.takeSnapshot);
  const editUndo = useEditStore((s) => s.undo);
  const editRedo = useEditStore((s) => s.redo);

  const [nodes, setNodes, onNodesChange] = useNodesState([] as FlowNode[]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([] as Edge[]);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [showChatPanel, setShowChatPanel] = useState(false);
  const [showSearchPanel, setShowSearchPanel] = useState(false);

  // 加载对话
  useEffect(() => {
    loadConversation(projectId, conversationId);
  }, [projectId, conversationId, loadConversation]);

  // 计算布局 - 包含批量选择信息
  useEffect(() => {
    if (!conversation) return;
    const { flowNodes, flowEdges } = computeTreeLayout(
      conversation.nodes,
      conversation.rootNodeIds,
      collapsedIds
    );

    // 编辑模式下允许拖拽；注入 batchIndex
    const batchIdSet = new Map<string, number>();
    batchSelectedIds.forEach((id, idx) => batchIdSet.set(id, idx));

    const processedNodes = flowNodes.map((node) => ({
      ...node,
      draggable: isEditMode,
      data: {
        ...node.data,
        batchIndex: batchIdSet.has(node.id) ? batchIdSet.get(node.id)! : null,
      },
    }));

    setNodes(processedNodes);
    setEdges(flowEdges);
  }, [conversation, collapsedIds, setNodes, setEdges, isEditMode, batchSelectedIds]);

  // 节点点击：正常模式选中，批量模式添加到选择
  const onNodeClick: NodeMouseHandler = useCallback(
    (_event, node) => {
      if (isBatchMode) {
        useEditStore.getState().addBatchNode(node.id);
      } else {
        setSelectedNodeId(node.id);
      }
    },
    [isBatchMode]
  );

  // 节点双击：打开对话面板
  const onNodeDoubleClick: NodeMouseHandler = useCallback(
    (_event, node) => {
      if (isBatchMode) return; // 批量模式下不打开面板
      setSelectedNodeId(node.id);
      setShowChatPanel(true);
    },
    [isBatchMode]
  );

  // 折叠/展开
  const toggleCollapse = useCallback((nodeId: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  // 创建根节点
  const handleCreateRoot = useCallback(async () => {
    if (!conversation) return;
    if (isEditMode) {
      takeSnapshot(conversation);
    }
    const node = conversationService.createNode(
      conversation.id,
      "user",
      "",
      null
    );
    await addNodeAndSave(node);
    setSelectedNodeId(node.id);
    setShowChatPanel(true);
  }, [conversation, addNodeAndSave, isEditMode, takeSnapshot]);

  // 删除选中节点
  const handleDeleteSelected = useCallback(async () => {
    if (!selectedNodeId || !conversation) return;
    if (!conversation.nodes[selectedNodeId]) return;

    if (isEditMode) {
      takeSnapshot(conversation);
    }

    await removeNodeTreeAndSave(selectedNodeId);
    setSelectedNodeId(null);
  }, [selectedNodeId, conversation, removeNodeTreeAndSave, isEditMode, takeSnapshot]);

  // 批量构建新树：将选中的节点重组为线性链
  const handleBatchBuildTree = useCallback(async () => {
    if (!conversation) return;
    if (batchSelectedIds.length < 2) return;

    // 确认
    const confirmed = window.confirm(
      `将 ${batchSelectedIds.length} 个选中节点构建为新的线性树？\n` +
      `第一个节点将成为根节点，后续节点依次成为子节点。\n` +
      `原有的父子关系将被修改。`
    );
    if (!confirmed) return;

    takeSnapshot(conversation);

    // 操作：直接修改 conversation 并 restore
    const conv = JSON.parse(JSON.stringify(conversation)) as typeof conversation;

    for (let i = 0; i < batchSelectedIds.length; i++) {
      const nodeId = batchSelectedIds[i];
      const node = conv.nodes[nodeId];
      if (!node) continue;

      // 断开与原父节点的连接
      if (node.parentId) {
        const oldParent = conv.nodes[node.parentId];
        if (oldParent) {
          oldParent.childrenIds = oldParent.childrenIds.filter((id) => id !== nodeId);
        }
      }

      // 从 rootNodeIds 中移除（如果之前是根节点）
      conv.rootNodeIds = conv.rootNodeIds.filter((id) => id !== nodeId);

      if (i === 0) {
        // 第一个节点成为根节点
        node.parentId = null;
        conv.rootNodeIds.push(nodeId);
      } else {
        // 后续节点成为前一个节点的子节点
        const prevNodeId = batchSelectedIds[i - 1];
        node.parentId = prevNodeId;

        const prevNode = conv.nodes[prevNodeId];
        if (prevNode && !prevNode.childrenIds.includes(nodeId)) {
          prevNode.childrenIds.push(nodeId);
        }
      }
    }

    conv.updatedAt = Date.now();
    await restoreConversation(conv);
    useEditStore.getState().clearBatchSelection();
  }, [conversation, batchSelectedIds, takeSnapshot, restoreConversation]);

  // 批量删除选中节点及其子树
  const handleBatchDelete = useCallback(async () => {
    if (!conversation) return;
    if (batchSelectedIds.length === 0) return;

    const confirmed = window.confirm(
      `确定要删除 ${batchSelectedIds.length} 个选中节点及其所有子树吗？此操作可通过撤销恢复。`
    );
    if (!confirmed) return;

    takeSnapshot(conversation);

    // 为避免删除顺序问题（删父节点后子节点已被级联删除），
    // 先收集所有要删除的节点树，然后一次性在快照上操作
    const conv = JSON.parse(JSON.stringify(conversation)) as typeof conversation;

    // 收集所有需要删除的节点ID（包括子树）
    const allToRemove = new Set<string>();
    const collectSubtree = (id: string) => {
      allToRemove.add(id);
      const node = conv.nodes[id];
      if (node) {
        node.childrenIds.forEach(collectSubtree);
      }
    };

    for (const nodeId of batchSelectedIds) {
      if (conv.nodes[nodeId]) {
        collectSubtree(nodeId);
      }
    }

    // 断开与父节点的连接（只处理选中的顶层节点）
    for (const nodeId of batchSelectedIds) {
      const node = conv.nodes[nodeId];
      if (!node) continue;

      if (node.parentId && conv.nodes[node.parentId] && !allToRemove.has(node.parentId)) {
        const parent = conv.nodes[node.parentId];
        parent.childrenIds = parent.childrenIds.filter((id) => id !== nodeId);
      }

      conv.rootNodeIds = conv.rootNodeIds.filter((id) => id !== nodeId);
    }

    // 删除所有节点
    for (const id of allToRemove) {
      delete conv.nodes[id];
    }

    conv.updatedAt = Date.now();
    await restoreConversation(conv);

    // 清空选择并退出批量模式
    useEditStore.getState().clearBatchSelection();
    setSelectedNodeId(null);
  }, [conversation, batchSelectedIds, takeSnapshot, restoreConversation]);

  // 撤销
  const handleUndo = useCallback(async () => {
    if (!conversation) return;
    const restored = editUndo(conversation);
    if (restored) {
      await restoreConversation(restored);
    }
  }, [conversation, editUndo, restoreConversation]);

  // 重做
  const handleRedo = useCallback(async () => {
    if (!conversation) return;
    const restored = editRedo(conversation);
    if (restored) {
      await restoreConversation(restored);
    }
  }, [conversation, editRedo, restoreConversation]);

  // 键盘事件
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ctrl+F：切换搜索面板
      if (e.ctrlKey && e.key === "f") {
        e.preventDefault();
        setShowSearchPanel((prev) => !prev);
        return;
      }

      // Ctrl+E：切换编辑模式
      if (e.ctrlKey && e.key === "e") {
        e.preventDefault();
        useEditStore.getState().toggleEditMode();
        return;
      }

      // Ctrl+B：切换批量操作模式（仅在编辑模式下）
      if (e.ctrlKey && e.key === "b") {
        if (useEditStore.getState().isEditMode) {
          e.preventDefault();
          useEditStore.getState().toggleBatchMode();
          return;
        }
      }

      // 以下快捷键仅在编辑模式下生效
      if (!useEditStore.getState().isEditMode) return;

      // Ctrl+Z：撤销
      if (e.ctrlKey && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
        return;
      }

      // Ctrl+Y / Ctrl+Shift+Z：重做
      if (
        (e.ctrlKey && e.key === "y") ||
        (e.ctrlKey && e.shiftKey && e.key === "Z")
      ) {
        e.preventDefault();
        handleRedo();
        return;
      }

      // Delete：删除选中节点
      if (e.key === "Delete") {
        e.preventDefault();
        handleDeleteSelected();
        return;
      }

      // Escape：退出批量模式
      if (e.key === "Escape" && useEditStore.getState().isBatchMode) {
        e.preventDefault();
        useEditStore.getState().toggleBatchMode();
        return;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleUndo, handleRedo, handleDeleteSelected]);

  // 右键菜单处理：批量模式下右键撤销最后选择
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (useEditStore.getState().isBatchMode) {
        e.preventDefault();
        useEditStore.getState().removeBatchLastNode();
      }
    };

    window.addEventListener("contextmenu", handler);
    return () => window.removeEventListener("contextmenu", handler);
  }, []);

  // 工具栏按钮触发的撤销/重做事件
  useEffect(() => {
    const onUndo = () => handleUndo();
    const onRedo = () => handleRedo();
    window.addEventListener("edit-undo", onUndo);
    window.addEventListener("edit-redo", onRedo);
    return () => {
      window.removeEventListener("edit-undo", onUndo);
      window.removeEventListener("edit-redo", onRedo);
    };
  }, [handleUndo, handleRedo]);

  // 画布节点折叠/展开自定义事件（由 ChatNodeComponent 的 chevron 点击触发）
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ nodeId: string }>).detail;
      if (detail?.nodeId) {
        toggleCollapse(detail.nodeId);
      }
    };
    window.addEventListener("toggle-collapse", handler);
    return () => window.removeEventListener("toggle-collapse", handler);
  }, [toggleCollapse]);

  // MiniMap 节点颜色
  const miniMapNodeColor = useCallback((node: { data?: Record<string, unknown> }) => {
    const data = node.data as { chatNode?: { role: string; isPartial: boolean } } | undefined;
    if (data?.chatNode?.isPartial) return "#f97316";
    if (data?.chatNode?.role === "user") return "#60a5fa";
    return "#4ade80";
  }, []);

  const convName = conversation?.name || "对话";

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* 顶部工具栏 */}
      <div className="flex items-center gap-3 px-4 py-2 border-b bg-background">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h3 className="text-sm font-medium truncate">{convName}</h3>

        {/* 编辑模式指示 */}
        {isEditMode && (
          <span className="text-xs text-orange-600 bg-orange-50 px-2 py-0.5 rounded border border-orange-200">
            编辑模式
          </span>
        )}

        {/* 批量模式指示 */}
        {isBatchMode && (
          <span className="text-xs text-purple-600 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
            批量选择中 - 点击节点添加，右键撤销，Esc退出
          </span>
        )}

        <div className="flex-1" />

        {/* 编辑工具栏 */}
        <EditToolbar
          onDeleteSelected={handleDeleteSelected}
          hasSelection={!!selectedNodeId}
          onBatchBuildTree={handleBatchBuildTree}
          onBatchDelete={handleBatchDelete}
          batchCount={batchSelectedIds.length}
        />

        <Button
          variant={showSearchPanel ? "secondary" : "outline"}
          size="icon"
          className="h-8 w-8"
          onClick={() => setShowSearchPanel(!showSearchPanel)}
          title="搜索 (Ctrl+F)"
        >
          <Search className="h-4 w-4" />
        </Button>

        <Button variant="outline" size="sm" onClick={handleCreateRoot}>
          <Plus className="h-4 w-4 mr-1" />
          新建根节点
        </Button>
      </div>

      {/* 画布 + 对话面板 */}
      <div className="flex-1 flex overflow-hidden">
        {/* React Flow 画布 */}
        <div className="flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            onNodeDoubleClick={onNodeDoubleClick}
            fitView
            minZoom={0.1}
            maxZoom={2}
            nodesDraggable={isEditMode}
            defaultEdgeOptions={{
              type: "smoothstep",
              style: { stroke: "#94a3b8", strokeWidth: 1.5 },
            }}
          >
            <Background gap={16} size={1} />
            <Controls position="bottom-left" showInteractive={false} />
            <FitToNode nodeId={selectedNodeId} />
            <MiniMap
              position="bottom-right"
              nodeColor={miniMapNodeColor}
              maskColor="rgba(0,0,0,0.1)"
            />
          </ReactFlow>
        </div>

        {/* 搜索面板 */}
        {showSearchPanel && (
          <SearchPanel
            projectId={projectId}
            onClose={() => setShowSearchPanel(false)}
            onNavigate={(convId, nodeId) => {
              if (convId === conversationId) {
                // 同一对话：直接跳转到节点
                setSelectedNodeId(nodeId);
                setShowChatPanel(true);
                setShowSearchPanel(false);
              } else if (onOpenConversation) {
                // 不同对话：通知父组件切换
                onOpenConversation(convId, nodeId);
              }
            }}
          />
        )}

        {/* 对话面板 */}
        {showChatPanel && selectedNodeId && conversation && (
          <ChatPanel
            conversation={conversation}
            selectedNodeId={selectedNodeId}
            onClose={() => setShowChatPanel(false)}
            onToggleCollapse={toggleCollapse}
            onSelectNode={setSelectedNodeId}
            collapsedIds={collapsedIds}
          />
        )}
      </div>
    </div>
  );
}
