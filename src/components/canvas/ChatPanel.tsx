import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import type { Conversation, ChatNode } from "@/types";
import { useConversationStore } from "@/stores/conversation-store";
import { useEditStore } from "@/stores/edit-store";
import { useConfigStore } from "@/stores/config-store";
import { useProjectStore } from "@/stores/project-store";
import { conversationService, buildContext, streamChatCompletion } from "@/services";
import { searchKnowledge } from "@/services/rag-service";
import { useAttachments } from "@/hooks/useAttachments";
import { MarkdownRenderer } from "@/components/ui/markdown-renderer";
import { Button } from "@/components/ui/button";
import {
  X,
  Send,
  Pin,
  PinOff,
  ChevronDown,
  ChevronRight,
  Star,
  Bot,
  Square,
  RefreshCw,
  Loader2,
  ImageIcon,
  FileText,
  Paperclip,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ChatPanelProps {
  conversation: Conversation;
  selectedNodeId: string;
  onClose: () => void;
  onToggleCollapse: (nodeId: string) => void;
  onSelectNode: (nodeId: string) => void;
  collapsedIds: Set<string>;
}

function traceMessages(
  nodes: Record<string, ChatNode>,
  nodeId: string
): ChatNode[] {
  const messages: ChatNode[] = [];
  let currentId: string | null = nodeId;
  while (currentId) {
    const node: ChatNode | undefined = nodes[currentId];
    if (!node) break;
    messages.unshift(node);
    currentId = node.parentId;
  }
  return messages;
}

export function ChatPanel({
  conversation,
  selectedNodeId,
  onClose,
  onToggleCollapse,
  onSelectNode,
  collapsedIds,
}: ChatPanelProps) {
  const { addNodeAndSave, updateNodeAndSave } = useConversationStore();
  const takeSnapshot = useEditStore((s) => s.takeSnapshot);
  const config = useConfigStore((s) => s.config);
  const projects = useProjectStore((s) => s.projects);

  const [inputText, setInputText] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const {
    attachments,
    handlePaste,
    pickImages,
    pickDocuments,
    removeAttachment,
    clearAttachments,
  } = useAttachments();

  const messages = useMemo(
    () => traceMessages(conversation.nodes, selectedNodeId),
    [conversation.nodes, selectedNodeId]
  );

  const currentNode = conversation.nodes[selectedNodeId];
  const project = projects.find((p) => p.id === conversation.projectId);

  // 获取当前活跃的 API 配置
  const activeProvider = config?.providers.find(
    (p) => p.id === config.activeProviderId
  );
  const activeModel = config?.activeModel || activeProvider?.defaultModel;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  // AI 生成回复（接受可选的 overrideNodeId）
  const handleGenerate = useCallback(async (overrideNodeId?: string) => {
    if (!activeProvider || !activeModel) {
      setError("请先在设置中配置 API");
      return;
    }

    const targetNodeId = overrideNodeId || selectedNodeId;

    // 从 store 获取最新的 conversation（避免闭包中的旧值）
    const latestConv = useConversationStore.getState().conversation;
    if (!latestConv) return;

    setIsGenerating(true);
    setStreamingContent("");
    setError(null);

    // 创建 AI 回复节点（初始为空，标记为 partial）
    const aiNode = conversationService.createNode(
      latestConv.id,
      "assistant",
      "",
      targetNodeId
    );
    aiNode.isPartial = true;
    aiNode.isUserEdited = false;
    aiNode.modelName = activeModel;
    await addNodeAndSave(aiNode);
    onSelectNode(aiNode.id);

    // RAG 检索（如果项目启用了 RAG）
    let ragContext: string | undefined;
    if (project?.ragEnabled && activeProvider.embedding) {
      try {
        const freshConv = useConversationStore.getState().conversation!;
        const targetNode = freshConv.nodes[targetNodeId];
        if (targetNode?.content) {
          const ragResults = await searchKnowledge(
            freshConv.projectId,
            targetNode.content,
            activeProvider.apiUrl,
            activeProvider.apiKey,
            activeProvider.embedding.model,
            5
          );
          if (ragResults.length > 0) {
            ragContext = ragResults
              .map(
                (r, i) =>
                  `[参考${i + 1}] (相似度: ${(r.score * 100).toFixed(1)}%)\n${r.chunk.content}`
              )
              .join("\n\n");
          }
        }
      } catch (err) {
        console.warn("RAG 检索失败:", err);
      }
    }

    // 获取最新节点数据用于构建上下文
    const freshNodes = useConversationStore.getState().conversation!.nodes;
    const context = await buildContext({
      nodes: freshNodes,
      currentNodeId: targetNodeId,
      projectDescription: project?.description,
      ragContext,
      maxTokens: activeProvider.maxContextTokens,
      model: activeModel,
    });

    // 流式调用
    const controller = new AbortController();
    abortControllerRef.current = controller;

    let fullContent = "";

    await streamChatCompletion({
      apiUrl: activeProvider.apiUrl,
      apiKey: activeProvider.apiKey,
      model: activeModel,
      messages: context.messages,
      modelConfig: activeProvider.modelConfig,
      signal: controller.signal,
      callbacks: {
        onToken: (token) => {
          fullContent += token;
          setStreamingContent(fullContent);
        },
        onDone: async (content) => {
          await updateNodeAndSave(aiNode.id, {
            content,
            isPartial: false,
          });
          setStreamingContent("");
          setIsGenerating(false);
          abortControllerRef.current = null;
        },
        onError: async (err) => {
          setError(err.message);
          if (fullContent) {
            await updateNodeAndSave(aiNode.id, {
              content: fullContent,
              isPartial: true,
            });
          }
          setStreamingContent("");
          setIsGenerating(false);
          abortControllerRef.current = null;
        },
      },
    });
  }, [
    activeProvider,
    activeModel,
    conversation,
    selectedNodeId,
    project,
    addNodeAndSave,
    updateNodeAndSave,
    onSelectNode,
  ]);

  // 发送消息（自动触发 AI 生成）
  const handleSend = useCallback(async () => {
    if (!inputText.trim() && attachments.length === 0) return;
    const node = conversationService.createNode(
      conversation.id,
      "user",
      inputText.trim(),
      selectedNodeId,
      attachments.length > 0 ? [...attachments] : undefined
    );
    await addNodeAndSave(node);
    setInputText("");
    clearAttachments();
    onSelectNode(node.id);
    // 自动生成 AI 回复
    handleGenerate(node.id);
  }, [inputText, attachments, conversation.id, selectedNodeId, addNodeAndSave, onSelectNode, clearAttachments, handleGenerate]);

  // 中断生成
  const handleStop = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  // 重新生成（在当前节点的父节点下创建新分支）
  const handleRegenerate = useCallback(async () => {
    if (!currentNode || currentNode.role !== "assistant") return;
    const parentId = currentNode.parentId;
    if (!parentId) return;
    onSelectNode(parentId);
    handleGenerate(parentId);
  }, [currentNode, onSelectNode, handleGenerate]);

  // 编辑节点内容（编辑模式下双击）
  const handleEditContent = useCallback(
    async (nodeId: string, newContent: string) => {
      if (!conversation) return;
      takeSnapshot(conversation);
      await updateNodeAndSave(nodeId, {
        content: newContent,
        isUserEdited: true,
      });
    },
    [conversation, updateNodeAndSave, takeSnapshot]
  );

  const handleEditSaved = useCallback((nodeId: string) => {
    const currentConfig = useConfigStore.getState().config;
    if (currentConfig?.autoGenerateOnEnter !== false) {
      handleGenerate(nodeId);
    }
  }, [handleGenerate]);

  const togglePin = async (nodeId: string) => {
    const node = conversation.nodes[nodeId];
    if (node) await updateNodeAndSave(nodeId, { isPinned: !node.isPinned });
  };

  const toggleStar = async (nodeId: string) => {
    const node = conversation.nodes[nodeId];
    if (node) await updateNodeAndSave(nodeId, { isStarred: !node.isStarred });
  };

  // 判断当前节点最后是用户消息（可以生成 AI 回复）
  const canGenerate =
    currentNode?.role === "user" && !isGenerating && !!activeProvider;

  return (
    <div className="w-[400px] border-l bg-background flex flex-col">
      {/* 面板头部 */}
      <div className="flex items-center justify-between px-4 py-2 border-b">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">对话视图</span>
          {activeModel && (
            <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              {activeModel}
            </span>
          )}
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            node={msg}
            isSelected={msg.id === selectedNodeId}
            hasChildren={msg.childrenIds.length > 0}
            isCollapsed={collapsedIds.has(msg.id)}
            isEditMode={true}
            autoEdit={
              msg === messages[messages.length - 1] &&
              msg.role === "user" &&
              !msg.content
            }
            onToggleCollapse={() => onToggleCollapse(msg.id)}
            onTogglePin={() => togglePin(msg.id)}
            onToggleStar={() => toggleStar(msg.id)}
            onEditContent={(newContent) => handleEditContent(msg.id, newContent)}
            onEditSaved={handleEditSaved}
          />
        ))}

        {/* 流式生成中的内容 */}
        {isGenerating && streamingContent && (
          <div className="rounded-lg p-3 text-sm bg-green-50 border border-green-200">
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="text-xs font-medium text-green-600">AI</span>
              <Loader2 className="h-3 w-3 animate-spin text-green-600" />
              <span className="text-xs text-green-600">生成中...</span>
            </div>
            <MarkdownRenderer content={streamingContent} streaming />
          </div>
        )}

        {/* 错误信息 */}
        {error && (
          <div className="rounded-lg p-3 text-sm bg-red-50 border border-red-200 text-red-600">
            {error}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 生成操作栏 */}
      {(canGenerate || isGenerating || currentNode?.role === "assistant") && (
        <div className="px-4 py-2 border-t bg-muted/30 flex items-center gap-2">
          {isGenerating ? (
            <>
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>生成中...</span>
              </div>
              <Button size="sm" variant="outline" className="text-destructive border-destructive/30 hover:bg-destructive/10" onClick={handleStop}>
                <Square className="h-3 w-3 mr-1" />
                停止
              </Button>
            </>
          ) : (
            <>
              {canGenerate && (
                <Button size="sm" onClick={() => handleGenerate()}>
                  <Bot className="h-3 w-3 mr-1" />
                  生成回复
                </Button>
              )}
              {currentNode?.role === "assistant" && (
                <Button size="sm" variant="outline" onClick={handleRegenerate}>
                  <RefreshCw className="h-3 w-3 mr-1" />
                  重新生成
                </Button>
              )}
            </>
          )}
          {!activeProvider && (
            <span className="text-xs text-muted-foreground">
              请先在设置中配置 API
            </span>
          )}
        </div>
      )}

      {/* 分支信息 */}
      {currentNode && currentNode.childrenIds.length > 1 && (
        <div className="px-4 py-2 border-t bg-muted/30">
          <span className="text-xs text-muted-foreground">
            {currentNode.childrenIds.length} 个分支
          </span>
        </div>
      )}

      {/* 输入区域 */}
      <div className="border-t p-3">
        {/* 附件预览 */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {attachments.map((att) => (
              <div
                key={att.id}
                className="relative group/att flex items-center gap-1.5 px-2 py-1 rounded-lg border bg-muted/50 text-xs"
              >
                {att.type === "image" ? (
                  <img
                    src={att.data}
                    alt={att.filename}
                    className="h-8 w-8 object-cover rounded"
                  />
                ) : (
                  <>
                    <FileText className="h-3 w-3 text-muted-foreground" />
                    <span className="max-w-[100px] truncate">{att.filename}</span>
                  </>
                )}
                <button
                  className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover/att:opacity-100 transition-opacity"
                  onClick={() => removeAttachment(att.id)}
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <div className="flex items-end gap-0.5">
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={pickImages}
                    disabled={isGenerating}
                  >
                    <ImageIcon className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top"><p>上传图片</p></TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={pickDocuments}
                    disabled={isGenerating}
                  >
                    <FileText className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top"><p>上传文档</p></TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onPaste={handlePaste}
            placeholder="输入消息...（可粘贴图片）"
            className="flex-1 min-h-[60px] max-h-[150px] p-2 border rounded-md bg-background text-sm resize-y outline-none focus:ring-1 focus:ring-ring"
            disabled={isGenerating}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <Button
            size="icon"
            className="self-end h-9 w-9"
            onClick={handleSend}
            disabled={(!inputText.trim() && attachments.length === 0) || isGenerating}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">
          Enter 发送，Shift+Enter 换行，Ctrl+V 粘贴图片
        </p>
      </div>
    </div>
  );
}

/* ============ 消息气泡 ============ */

interface MessageBubbleProps {
  node: ChatNode;
  isSelected: boolean;
  hasChildren: boolean;
  isCollapsed: boolean;
  isEditMode: boolean;
  autoEdit?: boolean;
  onToggleCollapse: () => void;
  onTogglePin: () => void;
  onToggleStar: () => void;
  onEditContent: (newContent: string) => void;
  onEditSaved?: (nodeId: string) => void;
}

function MessageBubble({
  node,
  isSelected,
  hasChildren,
  isCollapsed,
  isEditMode,
  autoEdit,
  onToggleCollapse,
  onTogglePin,
  onToggleStar,
  onEditContent,
  onEditSaved,
}: MessageBubbleProps) {
  const isUser = node.role === "user";
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const nodeAttachments = node.attachments || [];

  // 双击进入编辑
  const handleDoubleClick = useCallback(() => {
    if (!isEditMode) return;
    setEditText(node.content);
    setIsEditing(true);
  }, [isEditMode, node.content]);

  // 自动聚焦编辑框
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      // 将光标移到末尾
      textareaRef.current.selectionStart = textareaRef.current.value.length;
    }
  }, [isEditing]);

  // 自动进入编辑模式（用于空的根节点）
  useEffect(() => {
    if (autoEdit && !isEditing) {
      setEditText(node.content);
      setIsEditing(true);
    }
  }, [autoEdit]); // eslint-disable-line react-hooks/exhaustive-deps

  // 保存编辑
  const saveEdit = useCallback((source: 'enter' | 'blur' = 'blur') => {
    if (editText !== node.content) {
      onEditContent(editText);
    }
    setIsEditing(false);
    // 仅在 Enter 保存时触发自动生成，失焦不触发
    if (source === 'enter' && editText.trim() && onEditSaved) {
      onEditSaved(node.id);
    }
  }, [editText, node.content, node.id, onEditContent, onEditSaved]);

  // 取消编辑
  const cancelEdit = useCallback(() => {
    setIsEditing(false);
    setEditText("");
  }, []);

  // 键盘处理
  const handleEditKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        saveEdit('enter');
      } else if (e.key === "Escape") {
        e.preventDefault();
        cancelEdit();
      }
      // 阻止事件冒泡，防止触发画布快捷键
      e.stopPropagation();
    },
    [saveEdit, cancelEdit]
  );

  return (
    <div
      className={`group relative rounded-lg p-3 text-sm ${
        isUser
          ? "bg-blue-50 border border-blue-200"
          : "bg-green-50 border border-green-200"
      } ${isSelected ? "ring-2 ring-primary/50" : ""} ${
        isEditMode ? "cursor-text" : ""
      }`}
      onDoubleClick={handleDoubleClick}
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        <span
          className={`text-xs font-medium ${
            isUser ? "text-blue-600" : "text-green-600"
          }`}
        >
          {isUser ? "用户" : "AI"}
        </span>
        {node.isPartial && (
          <span className="text-xs text-orange-500">未完成</span>
        )}
        {node.modelName && (
          <span className="text-[10px] text-muted-foreground">
            {node.modelName}
          </span>
        )}
        {node.isUserEdited && (
          <span className="text-[10px] text-purple-500">已编辑</span>
        )}
        {nodeAttachments.length > 0 && (
          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
            <Paperclip className="h-2.5 w-2.5" />
            {nodeAttachments.length}
          </span>
        )}

        <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className="p-0.5 rounded hover:bg-background/50"
                  onClick={onToggleStar}
                >
                  <Star
                    className={`h-3 w-3 ${
                      node.isStarred
                        ? "text-yellow-500 fill-yellow-500"
                        : "text-muted-foreground"
                    }`}
                  />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p>收藏：标记重要消息</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className="p-0.5 rounded hover:bg-background/50"
                  onClick={onTogglePin}
                >
                  {node.isPinned ? (
                    <PinOff className="h-3 w-3 text-amber-500" />
                  ) : (
                    <Pin className="h-3 w-3 text-muted-foreground" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p>锁定：上下文裁剪时保留此消息</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {hasChildren && (
            <button
              className="p-0.5 rounded hover:bg-background/50"
              onClick={onToggleCollapse}
              title={isCollapsed ? "展开分支" : "折叠分支"}
            >
              {isCollapsed ? (
                <ChevronRight className="h-3 w-3 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-3 w-3 text-muted-foreground" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* 附件展示 */}
      {nodeAttachments.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-1.5">
          {nodeAttachments.map((att) =>
            att.type === "image" ? (
              <img
                key={att.id}
                src={att.data}
                alt={att.filename}
                className="max-h-[120px] max-w-full rounded border"
              />
            ) : (
              <span
                key={att.id}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted text-[10px] text-muted-foreground"
              >
                <FileText className="h-2.5 w-2.5" />
                {att.filename}
              </span>
            )
          )}
        </div>
      )}

      {/* 编辑模式下的内联编辑 */}
      {isEditing ? (
        <div className="space-y-1.5">
          <textarea
            ref={textareaRef}
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onKeyDown={handleEditKeyDown}
            onBlur={() => saveEdit('blur')}
            className="w-full min-h-[60px] max-h-[200px] p-2 border rounded bg-background text-sm resize-y outline-none focus:ring-1 focus:ring-ring"
          />
          <p className="text-[10px] text-muted-foreground">
            Enter 保存，Shift+Enter 换行，Esc 取消
          </p>
        </div>
      ) : (
        node.role === "assistant" ? (
          <MarkdownRenderer content={node.content} />
        ) : (
          <div className="whitespace-pre-wrap break-words text-foreground/90 leading-relaxed">
            {node.content || "(空消息)"}
          </div>
        )
      )}

      {(node.isPinned || node.isStarred) && (
        <div className="flex items-center gap-1 mt-1.5">
          {node.isPinned && (
            <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
              已锁定
            </span>
          )}
          {node.isStarred && (
            <span className="text-[10px] text-yellow-600 bg-yellow-50 px-1.5 py-0.5 rounded">
              已收藏
            </span>
          )}
        </div>
      )}
    </div>
  );
}
