import { useCallback, useEffect, useState, useRef } from "react";
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
  type Connection,
  type EdgeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { useConversationStore } from "@/stores/conversation-store";
import { useConfigStore } from "@/stores/config-store";
import { useEditStore } from "@/stores/edit-store";
import { ChatNodeComponent } from "./ChatNodeComponent";
import { ChatView } from "./ChatView";
import { SearchPanel } from "./SearchPanel";
import { EditToolbar } from "./EditToolbar";
import { MarkdownRenderer } from "@/components/ui/markdown-renderer";
import { computeTreeLayout } from "@/lib/tree-layout";
import { isAncestor, collectDescendantIds } from "@/lib/tree-utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ArrowLeft, Plus, Search, Loader2 } from "lucide-react";
import { conversationService, streamChatCompletion } from "@/services";
import { useConfirm } from "@/hooks/useConfirm";
import { AttachmentViewerSheet } from "@/components/ui/attachment-viewer";

const nodeTypes = {
  chatNode: ChatNodeComponent,
};

type CanvasMode = "edit" | "chat";

interface CanvasViewProps {
  projectId: string;
  conversationId: string;
  onBack: () => void;
  onOpenConversation?: (conversationId: string, nodeId: string) => void;
}

function FitToNode({ nodeId }: { nodeId: string | null }) {
  const { getNode, setCenter } = useReactFlow();

  useEffect(() => {
    if (!nodeId) return;
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
    detachNodeAndSave,
    reconnectNodeAndSave,
    restoreConversation,
    renameConversation,
  } = useConversationStore();

  const isBatchMode = useEditStore((s) => s.isBatchMode);
  const batchSelectedIds = useEditStore((s) => s.batchSelectedIds);
  const takeSnapshot = useEditStore((s) => s.takeSnapshot);
  const editUndo = useEditStore((s) => s.undo);
  const editRedo = useEditStore((s) => s.redo);
  const selectedEdgeId = useEditStore((s) => s.selectedEdgeId);
  const setSelectedEdge = useEditStore((s) => s.setSelectedEdge);

  const { setNodes: rfSetNodes } = useReactFlow();

  const [nodes, setNodes, onNodesChange] = useNodesState([] as FlowNode[]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([] as Edge[]);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [mode, setMode] = useState<CanvasMode>("edit");
  const [chatNodeId, setChatNodeId] = useState<string | null>(null);
  const [showSearchPanel, setShowSearchPanel] = useState(false);
  const [isRenamingConv, setIsRenamingConv] = useState(false);
  const [renameText, setRenameText] = useState("");

  // 总结对话框状态
  const [showSummarizeDialog, setShowSummarizeDialog] = useState(false);
  const [summarizePrompt, setSummarizePrompt] = useState("请总结以上对话的要点，保留关键信息，用简洁的语言概括。");
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summarizeContent, setSummarizeContent] = useState("");
  const [summarizeError, setSummarizeError] = useState<string | null>(null);
  const summarizeAbortRef = useRef<AbortController | null>(null);

  // 记录拖拽起始位置，用于子树跟随移动
  const dragStartPositions = useRef<Map<string, { x: number; y: number }>>(new Map());

  const { confirm, ConfirmDialog } = useConfirm();

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
      collapsedIds,
      conversation.projectId
    );

    const batchIdSet = new Map<string, number>();
    batchSelectedIds.forEach((id, idx) => batchIdSet.set(id, idx));

    const processedNodes = flowNodes.map((node) => ({
      ...node,
      draggable: true, // 始终可拖拽
      data: {
        ...node.data,
        batchIndex: batchIdSet.has(node.id) ? batchIdSet.get(node.id)! : null,
      },
    }));

    // 边样式：选中的边高亮
    const processedEdges = flowEdges.map((edge) => ({
      ...edge,
      selected: edge.id === selectedEdgeId,
      style: edge.id === selectedEdgeId
        ? { stroke: "#ef4444", strokeWidth: 2.5 }
        : { stroke: "#94a3b8", strokeWidth: 1.5 },
    }));

    setNodes(processedNodes);
    setEdges(processedEdges);
  }, [conversation, collapsedIds, setNodes, setEdges, batchSelectedIds, selectedEdgeId]);

  // 节点点击
  const onNodeClick: NodeMouseHandler = useCallback(
    (_event, node) => {
      if (isBatchMode) {
        useEditStore.getState().addBatchNode(node.id);
      } else {
        setSelectedNodeId(node.id);
        setSelectedEdge(null); // 取消边选择
      }
    },
    [isBatchMode, setSelectedEdge]
  );

  // 双击节点 → 进入对话模式
  const onNodeDoubleClick: NodeMouseHandler = useCallback(
    (_event, node) => {
      if (isBatchMode) return;
      setSelectedNodeId(node.id);
      setChatNodeId(node.id);
      setMode("chat");
    },
    [isBatchMode]
  );

  // 边点击 → 选中边
  const onEdgeClick: EdgeMouseHandler = useCallback(
    (_event, edge) => {
      setSelectedEdge(edge.id);
      setSelectedNodeId(null);
    },
    [setSelectedEdge]
  );

  // 画布空白处点击 → 取消选择
  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
    setSelectedEdge(null);
  }, [setSelectedEdge]);

  // 连接验证：防止循环连接和自连接
  const isValidConnection = useCallback(
    (connection: Connection | Edge) => {
      if (!conversation) return false;
      const { source, target } = connection;
      if (!source || !target) return false;
      if (source === target) return false;
      // target 不能是 source 的祖先（否则会形成循环）
      if (isAncestor(conversation.nodes, target, source)) return false;
      return true;
    },
    [conversation]
  );

  // 连接处理：建立新的父子关系
  const onConnect = useCallback(
    async (connection: Connection) => {
      if (!conversation) return;
      const { source, target } = connection;
      if (!source || !target) return;

      takeSnapshot(conversation);
      // source 是父节点（从 source handle 拖出），target 是子节点（连到 target handle）
      await reconnectNodeAndSave(target, source);
    },
    [conversation, takeSnapshot, reconnectNodeAndSave]
  );

  // 子树拖拽：拖拽时带动所有后代节点
  const onNodeDragStart = useCallback(
    (_event: React.MouseEvent, node: FlowNode) => {
      if (!conversation) return;
      const descendantIds = collectDescendantIds(conversation.nodes, node.id);
      const posMap = new Map<string, { x: number; y: number }>();

      // 记录所有后代节点的当前位置（相对于被拖拽节点的偏移）
      const draggedNode = nodes.find((n) => n.id === node.id);
      if (!draggedNode) return;

      for (const id of descendantIds) {
        const n = nodes.find((nd) => nd.id === id);
        if (n) {
          posMap.set(id, {
            x: n.position.x - draggedNode.position.x,
            y: n.position.y - draggedNode.position.y,
          });
        }
      }
      dragStartPositions.current = posMap;
    },
    [conversation, nodes]
  );

  const onNodeDrag = useCallback(
    (_event: React.MouseEvent, node: FlowNode) => {
      if (dragStartPositions.current.size === 0) return;

      rfSetNodes((nds) =>
        nds.map((n) => {
          const offset = dragStartPositions.current.get(n.id);
          if (offset) {
            return {
              ...n,
              position: {
                x: node.position.x + offset.x,
                y: node.position.y + offset.y,
              },
            };
          }
          return n;
        })
      );
    },
    [rfSetNodes]
  );

  const onNodeDragStop = useCallback(() => {
    dragStartPositions.current = new Map();
  }, []);

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
    takeSnapshot(conversation);
    const node = conversationService.createNode(
      conversation.id,
      "user",
      "",
      null
    );
    await addNodeAndSave(node);
    setSelectedNodeId(node.id);
    setChatNodeId(node.id);
    setMode("chat");
  }, [conversation, addNodeAndSave, takeSnapshot]);

  // 删除选中节点
  const handleDeleteSelected = useCallback(async () => {
    if (!conversation) return;

    // 优先处理选中的边（断开连接）
    if (selectedEdgeId) {
      const edge = edges.find((e) => e.id === selectedEdgeId);
      if (edge) {
        takeSnapshot(conversation);
        await detachNodeAndSave(edge.target);
        setSelectedEdge(null);
      }
      return;
    }

    // 其次处理选中的节点
    if (!selectedNodeId) return;
    if (!conversation.nodes[selectedNodeId]) return;

    takeSnapshot(conversation);
    await removeNodeTreeAndSave(selectedNodeId);
    setSelectedNodeId(null);
  }, [
    selectedNodeId,
    selectedEdgeId,
    conversation,
    edges,
    removeNodeTreeAndSave,
    detachNodeAndSave,
    takeSnapshot,
    setSelectedEdge,
  ]);

  // 批量构建新树
  const handleBatchBuildTree = useCallback(async () => {
    if (!conversation) return;
    if (batchSelectedIds.length < 2) return;

    const confirmed = await confirm({
      title: `将 ${batchSelectedIds.length} 个选中节点构建为新的线性树？`,
      description: "第一个节点将成为根节点，后续节点依次成为子节点。原有的父子关系将被修改。",
    });
    if (!confirmed) return;

    takeSnapshot(conversation);

    const conv = JSON.parse(JSON.stringify(conversation)) as typeof conversation;

    for (let i = 0; i < batchSelectedIds.length; i++) {
      const nodeId = batchSelectedIds[i];
      const node = conv.nodes[nodeId];
      if (!node) continue;

      if (node.parentId) {
        const oldParent = conv.nodes[node.parentId];
        if (oldParent) {
          oldParent.childrenIds = oldParent.childrenIds.filter((id) => id !== nodeId);
        }
      }

      conv.rootNodeIds = conv.rootNodeIds.filter((id) => id !== nodeId);

      if (i === 0) {
        node.parentId = null;
        conv.rootNodeIds.push(nodeId);
      } else {
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
  }, [conversation, batchSelectedIds, takeSnapshot, restoreConversation, confirm]);

  // 批量复制为新树：克隆节点形成新的独立树
  const handleBatchCopyTree = useCallback(async () => {
    if (!conversation) return;
    if (batchSelectedIds.length < 1) return;

    const confirmed = await confirm({
      title: `将 ${batchSelectedIds.length} 个选中节点复制为新的线性树？`,
      description: "原节点不会被修改，将创建副本。",
    });
    if (!confirmed) return;

    takeSnapshot(conversation);

    const conv = JSON.parse(JSON.stringify(conversation)) as typeof conversation;
    const now = Date.now();

    let prevNewId: string | null = null;
    for (let i = 0; i < batchSelectedIds.length; i++) {
      const originalNode = conv.nodes[batchSelectedIds[i]];
      if (!originalNode) continue;

      // 创建副本节点
      const newNode = conversationService.createNode(
        conversation.id,
        originalNode.role,
        originalNode.content,
        prevNewId
      );
      newNode.modelName = originalNode.modelName;
      newNode.isUserEdited = true;
      newNode.createdAt = now;
      newNode.updatedAt = now;

      conv.nodes[newNode.id] = newNode;

      if (i === 0) {
        conv.rootNodeIds.push(newNode.id);
      } else if (prevNewId) {
        const prevNode = conv.nodes[prevNewId];
        if (prevNode && !prevNode.childrenIds.includes(newNode.id)) {
          prevNode.childrenIds.push(newNode.id);
        }
      }

      prevNewId = newNode.id;
    }

    conv.updatedAt = now;
    await restoreConversation(conv);
    useEditStore.getState().clearBatchSelection();
  }, [conversation, batchSelectedIds, takeSnapshot, restoreConversation, confirm]);

  // 批量删除
  const handleBatchDelete = useCallback(async () => {
    if (!conversation) return;
    if (batchSelectedIds.length === 0) return;

    const confirmed = await confirm({
      title: `确定要删除 ${batchSelectedIds.length} 个选中节点及其所有子树吗？`,
      description: "此操作可通过撤销恢复。",
    });
    if (!confirmed) return;

    takeSnapshot(conversation);

    const conv = JSON.parse(JSON.stringify(conversation)) as typeof conversation;

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

    for (const nodeId of batchSelectedIds) {
      const node = conv.nodes[nodeId];
      if (!node) continue;

      if (node.parentId && conv.nodes[node.parentId] && !allToRemove.has(node.parentId)) {
        const parent = conv.nodes[node.parentId];
        parent.childrenIds = parent.childrenIds.filter((id) => id !== nodeId);
      }

      conv.rootNodeIds = conv.rootNodeIds.filter((id) => id !== nodeId);
    }

    for (const id of allToRemove) {
      delete conv.nodes[id];
    }

    conv.updatedAt = Date.now();
    await restoreConversation(conv);

    useEditStore.getState().clearBatchSelection();
    setSelectedNodeId(null);
  }, [conversation, batchSelectedIds, takeSnapshot, restoreConversation, confirm]);

  // 打开总结对话框
  const handleBatchSummarize = useCallback(() => {
    if (!conversation || batchSelectedIds.length === 0) return;
    setSummarizeContent("");
    setSummarizeError(null);
    setShowSummarizeDialog(true);
  }, [conversation, batchSelectedIds]);

  // 执行 AI 总结
  const executeSummarize = useCallback(async () => {
    if (!conversation) return;

    const config = useConfigStore.getState().config;
    const activeProvider = config?.providers.find(
      (p) => p.id === config.activeProviderId
    );
    const activeModel = config?.activeModel;

    if (!activeProvider || !activeModel) {
      setSummarizeError("请先在设置中配置 API");
      return;
    }

    // 按选中顺序组装上下文
    const parts: string[] = [];
    for (const nodeId of batchSelectedIds) {
      const node = conversation.nodes[nodeId];
      if (!node) continue;
      const roleLabel = node.role === "user" ? "用户" : "AI";
      parts.push(`[${roleLabel}]\n${node.content}`);
    }

    const contextText = parts.join("\n\n");
    const fullPrompt = `以下是一段对话记录：\n\n${contextText}\n\n---\n\n${summarizePrompt}`;

    setIsSummarizing(true);
    setSummarizeContent("");
    setSummarizeError(null);

    const controller = new AbortController();
    summarizeAbortRef.current = controller;

    let fullContent = "";

    await streamChatCompletion({
      apiUrl: activeProvider.apiUrl,
      apiKey: activeProvider.apiKey,
      model: activeModel,
      messages: [{ role: "user", content: fullPrompt }],
      modelConfig: activeProvider.modelConfig,
      signal: controller.signal,
      callbacks: {
        onToken: (token) => {
          fullContent += token;
          setSummarizeContent(fullContent);
        },
        onDone: async (content) => {
          // 创建为新的根节点
          takeSnapshot(conversation);
          const newNode = conversationService.createNode(
            conversation.id,
            "assistant",
            content,
            null
          );
          newNode.modelName = activeModel;
          newNode.isPartial = false;
          await addNodeAndSave(newNode);
          setSelectedNodeId(newNode.id);

          setIsSummarizing(false);
          setShowSummarizeDialog(false);
          useEditStore.getState().clearBatchSelection();
        },
        onError: (err) => {
          setSummarizeError(err.message);
          setIsSummarizing(false);
        },
      },
    });
  }, [conversation, batchSelectedIds, summarizePrompt, takeSnapshot, addNodeAndSave]);

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
    if (mode === "chat") return; // 对话模式下由 ChatView 处理

    const handler = (e: KeyboardEvent) => {
      // 忽略输入框中的非修饰键
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      // Ctrl+F：搜索
      if (e.ctrlKey && e.key === "f") {
        e.preventDefault();
        setShowSearchPanel((prev) => !prev);
        return;
      }

      // Ctrl+B：批量模式
      if (e.ctrlKey && e.key === "b") {
        e.preventDefault();
        useEditStore.getState().toggleBatchMode();
        return;
      }

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

      // 以下仅在非输入框时
      if (isInput) return;

      // Delete：删除选中边或节点
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
  }, [mode, handleUndo, handleRedo, handleDeleteSelected]);

  // 右键菜单：批量模式下撤销最后选择
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

  // 折叠/展开自定义事件
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

  // ===== 对话模式 =====
  if (mode === "chat" && chatNodeId && conversation) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <ChatView
          conversation={conversation}
          selectedNodeId={chatNodeId}
          onBack={() => {
            setMode("edit");
            setSelectedNodeId(chatNodeId);
          }}
          onSelectNode={(nodeId) => setChatNodeId(nodeId)}
        />
      </div>
    );
  }

  // ===== 编辑模式 =====
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* 顶部工具栏 */}
      <div className="flex items-center gap-3 px-4 py-2 border-b bg-background">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        {isRenamingConv ? (
          <input
            type="text"
            value={renameText}
            onChange={(e) => setRenameText(e.target.value)}
            className="text-sm font-medium bg-transparent outline-none border-b border-primary max-w-[200px]"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const trimmed = renameText.trim();
                if (trimmed && trimmed !== convName) {
                  renameConversation(projectId, conversationId, trimmed);
                }
                setIsRenamingConv(false);
              } else if (e.key === "Escape") {
                setIsRenamingConv(false);
              }
            }}
            onBlur={() => {
              const trimmed = renameText.trim();
              if (trimmed && trimmed !== convName) {
                renameConversation(projectId, conversationId, trimmed);
              }
              setIsRenamingConv(false);
            }}
          />
        ) : (
          <h3
            className="text-sm font-medium truncate cursor-pointer hover:text-primary/80"
            onDoubleClick={() => {
              setRenameText(convName);
              setIsRenamingConv(true);
            }}
            title="双击重命名"
          >
            {convName}
          </h3>
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
          hasSelection={!!selectedNodeId || !!selectedEdgeId}
          onBatchBuildTree={handleBatchBuildTree}
          onBatchCopyTree={handleBatchCopyTree}
          onBatchDelete={handleBatchDelete}
          onBatchSummarize={handleBatchSummarize}
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

      {/* 画布 */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            onNodeDoubleClick={onNodeDoubleClick}
            onEdgeClick={onEdgeClick}
            onPaneClick={onPaneClick}
            onConnect={onConnect}
            onNodeDragStart={onNodeDragStart}
            onNodeDrag={onNodeDrag}
            onNodeDragStop={onNodeDragStop}
            isValidConnection={isValidConnection}
            fitView
            minZoom={0.1}
            maxZoom={2}
            nodesDraggable={true}
            elementsSelectable={true}
            connectOnClick={false}
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
                setSelectedNodeId(nodeId);
                setChatNodeId(nodeId);
                setMode("chat");
                setShowSearchPanel(false);
              } else if (onOpenConversation) {
                onOpenConversation(convId, nodeId);
              }
            }}
          />
        )}
      </div>

      {/* 总结对话框 */}
      <Dialog open={showSummarizeDialog} onOpenChange={(open) => {
        if (!open && isSummarizing) {
          summarizeAbortRef.current?.abort();
          setIsSummarizing(false);
        }
        setShowSummarizeDialog(open);
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>AI 总结</DialogTitle>
            <DialogDescription>
              将 {batchSelectedIds.length} 个选中节点的内容发送给 AI 进行总结，结果生成为新的根节点。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">总结指令</label>
              <textarea
                value={summarizePrompt}
                onChange={(e) => setSummarizePrompt(e.target.value)}
                disabled={isSummarizing}
                className="w-full mt-1.5 min-h-[80px] max-h-[150px] p-2.5 border rounded-lg bg-background text-sm resize-y outline-none focus:ring-2 focus:ring-ring"
                placeholder="输入你希望 AI 如何总结这些内容..."
              />
            </div>

            {/* 流式生成预览 */}
            {isSummarizing && summarizeContent && (
              <div className="rounded-lg border p-3 max-h-[200px] overflow-y-auto bg-green-50">
                <div className="flex items-center gap-1.5 mb-2">
                  <Loader2 className="h-3 w-3 animate-spin text-green-600" />
                  <span className="text-xs text-green-600 font-medium">生成中...</span>
                </div>
                <MarkdownRenderer content={summarizeContent} streaming />
              </div>
            )}

            {summarizeError && (
              <p className="text-sm text-destructive">{summarizeError}</p>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                if (isSummarizing) {
                  summarizeAbortRef.current?.abort();
                  setIsSummarizing(false);
                } else {
                  setShowSummarizeDialog(false);
                }
              }}
            >
              {isSummarizing ? "中断" : "取消"}
            </Button>
            <Button
              onClick={executeSummarize}
              disabled={isSummarizing || !summarizePrompt.trim()}
            >
              开始总结
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {ConfirmDialog}
      <AttachmentViewerSheet />
    </div>
  );
}
