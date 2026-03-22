import { useCallback, useEffect, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
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

export function CanvasView({
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

  // 计算布局
  useEffect(() => {
    if (!conversation) return;
    const { flowNodes, flowEdges } = computeTreeLayout(
      conversation.nodes,
      conversation.rootNodeIds,
      collapsedIds
    );

    // 编辑模式下允许拖拽
    const processedNodes = flowNodes.map((node) => ({
      ...node,
      draggable: isEditMode,
    }));

    setNodes(processedNodes);
    setEdges(flowEdges);
  }, [conversation, collapsedIds, setNodes, setEdges, isEditMode]);

  // 节点点击：选中
  const onNodeClick: NodeMouseHandler = useCallback(
    (_event, node) => {
      setSelectedNodeId(node.id);
    },
    []
  );

  // 节点双击：打开对话面板
  const onNodeDoubleClick: NodeMouseHandler = useCallback(
    (_event, node) => {
      setSelectedNodeId(node.id);
      setShowChatPanel(true);
    },
    []
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
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleUndo, handleRedo, handleDeleteSelected]);

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

        <div className="flex-1" />

        {/* 编辑工具栏 */}
        <EditToolbar
          onDeleteSelected={handleDeleteSelected}
          hasSelection={!!selectedNodeId}
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
            <Controls position="bottom-left" />
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
