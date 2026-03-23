import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import type { Conversation, ChatNode } from "@/types";
import { useConversationStore } from "@/stores/conversation-store";
import { useEditStore } from "@/stores/edit-store";
import { useConfigStore } from "@/stores/config-store";
import { useProjectStore } from "@/stores/project-store";
import { conversationService, buildContext, streamChatCompletion } from "@/services";
import { searchKnowledge } from "@/services/rag-service";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Send,
  Pin,
  PinOff,
  ChevronRight,
  ChevronLeft,
  Star,
  Bot,
  Square,
  RefreshCw,
  Loader2,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ChatViewProps {
  conversation: Conversation;
  selectedNodeId: string;
  onBack: () => void;
  onSelectNode: (nodeId: string) => void;
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

export function ChatView({
  conversation,
  selectedNodeId,
  onBack,
  onSelectNode,
}: ChatViewProps) {
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
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const messages = useMemo(
    () => traceMessages(conversation.nodes, selectedNodeId),
    [conversation.nodes, selectedNodeId]
  );

  const currentNode = conversation.nodes[selectedNodeId];
  const project = projects.find((p) => p.id === conversation.projectId);

  const activeProvider = config?.providers.find(
    (p) => p.id === config.activeProviderId
  );
  const activeModel = config?.activeModel || activeProvider?.defaultModel;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  // 自动聚焦输入框
  useEffect(() => {
    inputRef.current?.focus();
  }, [selectedNodeId]);

  // Escape 返回编辑模式
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isGenerating) {
        const target = e.target as HTMLElement;
        const isInputFocused =
          target.tagName === "TEXTAREA" || target.tagName === "INPUT";
        // 如果在输入框中且有内容，先不退出
        if (isInputFocused && inputText.trim()) return;
        e.preventDefault();
        onBack();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onBack, isGenerating, inputText]);

  // 发送消息
  const handleSend = useCallback(async () => {
    if (!inputText.trim()) return;
    const node = conversationService.createNode(
      conversation.id,
      "user",
      inputText.trim(),
      selectedNodeId
    );
    await addNodeAndSave(node);
    setInputText("");
    onSelectNode(node.id);
  }, [inputText, conversation.id, selectedNodeId, addNodeAndSave, onSelectNode]);

  // AI 生成回复
  const handleGenerate = useCallback(async () => {
    if (!activeProvider || !activeModel) {
      setError("请先在设置中配置 API");
      return;
    }

    setIsGenerating(true);
    setStreamingContent("");
    setError(null);

    const aiNode = conversationService.createNode(
      conversation.id,
      "assistant",
      "",
      selectedNodeId
    );
    aiNode.isPartial = true;
    aiNode.isUserEdited = false;
    aiNode.modelName = activeModel;
    await addNodeAndSave(aiNode);
    onSelectNode(aiNode.id);

    // RAG 检索
    let ragContext: string | undefined;
    if (project?.ragEnabled && activeProvider.embedding) {
      try {
        const currentNode = conversation.nodes[selectedNodeId];
        if (currentNode?.content) {
          const ragResults = await searchKnowledge(
            conversation.projectId,
            currentNode.content,
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

    const context = buildContext({
      nodes: conversation.nodes,
      currentNodeId: selectedNodeId,
      projectDescription: project?.description,
      ragContext,
      maxTokens: activeProvider.maxContextTokens,
      model: activeModel,
    });

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

  const handleStop = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const handleRegenerate = useCallback(async () => {
    if (!currentNode || currentNode.role !== "assistant") return;
    const parentId = currentNode.parentId;
    if (!parentId) return;
    onSelectNode(parentId);
    setTimeout(() => handleGenerate(), 100);
  }, [currentNode, onSelectNode, handleGenerate]);

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

  const togglePin = async (nodeId: string) => {
    const node = conversation.nodes[nodeId];
    if (node) await updateNodeAndSave(nodeId, { isPinned: !node.isPinned });
  };

  const toggleStar = async (nodeId: string) => {
    const node = conversation.nodes[nodeId];
    if (node) await updateNodeAndSave(nodeId, { isStarred: !node.isStarred });
  };

  const canGenerate =
    currentNode?.role === "user" && !isGenerating && !!activeProvider;

  // 分支导航：查找当前节点在兄弟节点中的位置
  const getBranchInfo = useCallback(
    (nodeId: string) => {
      const node = conversation.nodes[nodeId];
      if (!node || !node.parentId) return null;
      const parent = conversation.nodes[node.parentId];
      if (!parent || parent.childrenIds.length <= 1) return null;
      const index = parent.childrenIds.indexOf(nodeId);
      return {
        current: index + 1,
        total: parent.childrenIds.length,
        siblings: parent.childrenIds,
        index,
      };
    },
    [conversation.nodes]
  );

  // 切换到同一层的兄弟分支
  const switchBranch = useCallback(
    (nodeId: string, direction: -1 | 1) => {
      const info = getBranchInfo(nodeId);
      if (!info) return;
      const newIndex = info.index + direction;
      if (newIndex < 0 || newIndex >= info.total) return;
      onSelectNode(info.siblings[newIndex]);
    },
    [getBranchInfo, onSelectNode]
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background">
      {/* 顶部栏 */}
      <div className="flex items-center gap-3 px-4 py-3 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onBack}
          title="返回画布 (Escape)"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h3 className="text-sm font-medium truncate">{conversation.name}</h3>
        {activeModel && (
          <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
            {activeModel}
          </span>
        )}
        <div className="flex-1" />
        <span className="text-xs text-muted-foreground">
          Esc 返回画布
        </span>
      </div>

      {/* 消息列表 - 居中布局 */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
          {messages.map((msg) => {
            const branchInfo = getBranchInfo(msg.id);
            return (
              <div key={msg.id}>
                {/* 分支导航器 */}
                {branchInfo && (
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      disabled={branchInfo.index === 0}
                      onClick={() => switchBranch(msg.id, -1)}
                    >
                      <ChevronLeft className="h-3 w-3" />
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      分支 {branchInfo.current}/{branchInfo.total}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      disabled={branchInfo.index === branchInfo.total - 1}
                      onClick={() => switchBranch(msg.id, 1)}
                    >
                      <ChevronRight className="h-3 w-3" />
                    </Button>
                  </div>
                )}
                <ChatBubble
                  node={msg}
                  isSelected={msg.id === selectedNodeId}
                  onTogglePin={() => togglePin(msg.id)}
                  onToggleStar={() => toggleStar(msg.id)}
                  onEditContent={(newContent) => handleEditContent(msg.id, newContent)}
                />
              </div>
            );
          })}

          {/* 流式生成中 */}
          {isGenerating && streamingContent && (
            <div className="rounded-xl p-4 text-sm bg-green-50 border border-green-200">
              <div className="flex items-center gap-1.5 mb-2">
                <span className="text-xs font-medium text-green-600">AI</span>
                <Loader2 className="h-3 w-3 animate-spin text-green-600" />
                <span className="text-xs text-green-600">生成中...</span>
              </div>
              <div className="whitespace-pre-wrap break-words text-foreground/90 leading-relaxed">
                {streamingContent}
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-xl p-4 text-sm bg-red-50 border border-red-200 text-red-600">
              {error}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* 生成操作栏 */}
      {(canGenerate || isGenerating || currentNode?.role === "assistant") && (
        <div className="border-t bg-muted/30">
          <div className="max-w-3xl mx-auto px-4 py-2 flex items-center gap-2">
            {isGenerating ? (
              <>
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>生成中...</span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive border-destructive/30 hover:bg-destructive/10"
                  onClick={handleStop}
                >
                  <Square className="h-3 w-3 mr-1" />
                  停止
                </Button>
              </>
            ) : (
              <>
                {canGenerate && (
                  <Button size="sm" onClick={handleGenerate}>
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
        </div>
      )}

      {/* 输入区域 */}
      <div className="border-t bg-background">
        <div className="max-w-3xl mx-auto p-4">
          <div className="flex gap-2">
            <textarea
              ref={inputRef}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="输入消息..."
              className="flex-1 min-h-[60px] max-h-[150px] p-3 border rounded-xl bg-background text-sm resize-y outline-none focus:ring-2 focus:ring-ring"
              disabled={isGenerating}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
                // 阻止 Escape 冒泡到全局处理（如果有内容）
                if (e.key === "Escape" && inputText.trim()) {
                  e.stopPropagation();
                  setInputText("");
                }
              }}
            />
            <Button
              size="icon"
              className="self-end h-10 w-10 rounded-xl"
              onClick={handleSend}
              disabled={!inputText.trim() || isGenerating}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5">
            Enter 发送，Shift+Enter 换行
          </p>
        </div>
      </div>
    </div>
  );
}

/* ============ 全屏消息气泡 ============ */

interface ChatBubbleProps {
  node: ChatNode;
  isSelected: boolean;
  onTogglePin: () => void;
  onToggleStar: () => void;
  onEditContent: (newContent: string) => void;
}

function ChatBubble({
  node,
  isSelected,
  onTogglePin,
  onToggleStar,
  onEditContent,
}: ChatBubbleProps) {
  const isUser = node.role === "user";
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleDoubleClick = useCallback(() => {
    setEditText(node.content);
    setIsEditing(true);
  }, [node.content]);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.selectionStart = textareaRef.current.value.length;
    }
  }, [isEditing]);

  const saveEdit = useCallback(() => {
    if (editText !== node.content) {
      onEditContent(editText);
    }
    setIsEditing(false);
  }, [editText, node.content, onEditContent]);

  const cancelEdit = useCallback(() => {
    setIsEditing(false);
    setEditText("");
  }, []);

  const handleEditKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        saveEdit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        cancelEdit();
      }
      e.stopPropagation();
    },
    [saveEdit, cancelEdit]
  );

  return (
    <div
      className={`group relative rounded-xl p-4 text-sm ${
        isUser
          ? "bg-blue-50 border border-blue-200"
          : "bg-green-50 border border-green-200"
      } ${isSelected ? "ring-2 ring-primary/50" : ""}`}
      onDoubleClick={handleDoubleClick}
    >
      <div className="flex items-center gap-1.5 mb-2">
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

        <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className="p-1 rounded hover:bg-background/50"
                  onClick={onToggleStar}
                >
                  <Star
                    className={`h-3.5 w-3.5 ${
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
                  className="p-1 rounded hover:bg-background/50"
                  onClick={onTogglePin}
                >
                  {node.isPinned ? (
                    <PinOff className="h-3.5 w-3.5 text-amber-500" />
                  ) : (
                    <Pin className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p>锁定：上下文裁剪时保留此消息</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {isEditing ? (
        <div className="space-y-1.5">
          <textarea
            ref={textareaRef}
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onKeyDown={handleEditKeyDown}
            onBlur={saveEdit}
            className="w-full min-h-[80px] max-h-[300px] p-3 border rounded-lg bg-background text-sm resize-y outline-none focus:ring-1 focus:ring-ring"
          />
          <p className="text-[10px] text-muted-foreground">
            Enter 保存，Shift+Enter 换行，Esc 取消
          </p>
        </div>
      ) : (
        <div className="whitespace-pre-wrap break-words text-foreground/90 leading-relaxed">
          {node.content || "(空消息)"}
        </div>
      )}

      {(node.isPinned || node.isStarred) && (
        <div className="flex items-center gap-1 mt-2">
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
